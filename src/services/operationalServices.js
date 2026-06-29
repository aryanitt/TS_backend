const repo = require("../repositories/operationalRepo");
const { emitTenant, emitEmployee } = require("../realtime/socket");
const { cacheGet, cacheSet } = require("../config/redis");

const { DEFAULT_TENANT_ID } = repo;

function tenant(req) {
  return req.headers["x-tenant-id"] || DEFAULT_TENANT_ID;
}

function actor(req) {
  return {
    actorId: req.headers["x-user-id"] || "system",
    actorName: req.headers["x-user-name"] || "System",
    actorRole: req.headers["x-user-role"] || "system",
    ip: req.ip,
  };
}

function normalizeLeadInput(input = {}) {
  const name = input.leadName || input.lead_name || input.name || input.contactName;
  return {
    leadName: name || "Unknown Lead",
    companyName: input.companyName || input.company_name || input.company || input.business_name || "",
    phone: input.phone || input.mobile || input.contact || "",
    email: input.email || "",
    city: input.city || "",
    country: input.country || "India",
    source: normalizeSource(input.source || input.channel || "manual"),
    formName: input.formName || input.form_name,
    pipelineStage: input.pipelineStage || input.pipeline_stage || "new",
    temperature: normalizeTemperature(input.temperature || input.status || input.priority),
    status: input.status || "New Lead",
    winProbability: Number(input.winProbability ?? input.win_probability ?? 0),
    expectedRevenue: Number(input.expectedRevenue ?? input.expected_revenue ?? input.revenue ?? 0),
    priority: normalizePriority(input.priority),
    requirements: input.requirements || input.notes || "",
    insights: input.insights || "",
    sourceMeta: input.sourceMeta || input.rawPayload || {},
  };
}

function normalizeSource(value) {
  const s = String(value || "").toLowerCase();
  if (s.includes("n8n") || s.includes("webhook")) return "n8n";
  if (s.includes("google")) return "google_ads";
  if (s.includes("meta") || s.includes("facebook") || s.includes("instagram")) return "meta_ads";
  if (s.includes("whatsapp")) return "whatsapp";
  if (s.includes("landing")) return "landing_page";
  if (s.includes("form")) return "form";
  if (s.includes("campaign")) return "campaign";
  if (s.includes("website") || s.includes("web")) return "website";
  if (s.includes("api")) return "api";
  if (s.includes("referral")) return "referral";
  if (s.includes("third")) return "third_party";
  return "manual";
}

function normalizeTemperature(value) {
  const s = String(value || "").toLowerCase();
  if (s.includes("hot") || s.includes("critical") || s.includes("high")) return "hot";
  if (s.includes("cold") || s.includes("low")) return "cold";
  return "warm";
}

function normalizePriority(value) {
  const s = String(value || "").toLowerCase();
  if (["critical", "high", "medium", "low"].includes(s)) return s;
  if (s.includes("hot")) return "high";
  return "medium";
}

async function writeTimeline({ tenantId, leadId, type, summary, payload, actor: a = {} }) {
  const event = await repo.insertTimeline({
    tenantId,
    leadId,
    type,
    summary,
    payload,
    actorId: a.actorId,
    actorName: a.actorName,
    actorRole: a.actorRole,
  });
  emitTenant(tenantId, "lead.timeline", event);
  return event;
}

async function writeAudit({ tenantId, action, resource, resourceId, before, after, metadata, actor: a = {} }) {
  return repo.insertAudit({
    tenantId,
    action,
    resource,
    resourceId,
    before,
    after,
    metadata,
    actorId: a.actorId,
    ip: a.ip,
  });
}

async function notify({ tenantId, employeeId, userId, type, title, body, entityType, entityId }) {
  const notification = await repo.insertNotification({
    tenantId,
    employeeId,
    userId,
    type,
    title,
    body,
    entityType,
    entityId,
  });
  emitTenant(tenantId, "notification.new", notification);
  if (employeeId) emitEmployee(tenantId, employeeId, "notification.new", notification);
  return notification;
}

async function createLead(input, options = {}) {
  const tenantId = options.tenantId || DEFAULT_TENANT_ID;
  const lead = await repo.insertLead(tenantId, normalizeLeadInput(input));

  const priority = lead.temperature === "hot" ? 100 : lead.temperature === "warm" ? 50 : 10;
  const queueItem = await repo.insertQueueItem(tenantId, lead.id, priority);

  await writeTimeline({
    tenantId,
    leadId: lead.id,
    type: "lead_created",
    summary: `Lead created from ${lead.source}`,
    payload: { source: lead.source, queueId: queueItem.id },
    actor: options.actor,
  });

  emitTenant(tenantId, "lead.created", lead);

  if (options.autoAssign !== false) {
    processAssignmentQueue(tenantId, { limit: 1, actor: options.actor }).catch(() => {});
  }

  return { lead, queueItem };
}

async function getOrCreateAssignmentConfig(tenantId) {
  let config = await repo.getAssignmentConfig(tenantId);
  if (!config) {
    const employees = await repo.listActiveEmployees(tenantId);
    config = await repo.createAssignmentConfig(
      tenantId,
      employees.map((e) => e.id),
    );
  }
  return config;
}

async function resetDailyStatsIfNeeded(config) {
  const today = new Date().toISOString().slice(0, 10);
  if (config.todayKey !== today) {
    config.todayKey = today;
    config.todayStats = { total: 0, byEmployee: {} };
    await repo.saveAssignmentConfig(config);
  }
}

function todayCount(config, employeeId) {
  const map = config.todayStats?.byEmployee || {};
  return Number(map[String(employeeId)] || 0);
}

function setTodayCount(config, employeeId, nextValue) {
  if (!config.todayStats) config.todayStats = { total: 0, byEmployee: {} };
  if (!config.todayStats.byEmployee) config.todayStats.byEmployee = {};
  config.todayStats.byEmployee[String(employeeId)] = nextValue;
}

async function eligibleEmployees(tenantId, config) {
  const paused = new Set((config.pausedEmployees || []).map(String));
  const employees = await repo.listActiveEmployees(tenantId);
  return employees.filter((e) => {
    if (paused.has(String(e.id))) return false;
    if (e.capacity?.receivingPaused) return false;
    return true;
  });
}

async function pickEmployee(tenantId, config) {
  const employees = await eligibleEmployees(tenantId, config);
  const filtered = employees.filter((e) => {
    const active = e.capacity?.currentActiveLeads || 0;
    const maxActive = config.workloadRules?.maxActiveLeads || e.capacity?.maxActiveLeads || 40;
    const dailyLimit = config.workloadRules?.maxDailyAssignments || e.capacity?.dailyLimit || 25;
    return active < maxActive && todayCount(config, e.id) < dailyLimit;
  });

  if (!filtered.length) return null;

  if (config.mode === "workload") {
    return filtered.sort((a, b) => (a.capacity.currentActiveLeads || 0) - (b.capacity.currentActiveLeads || 0))[0];
  }

  const order = (config.roundRobinOrder?.length ? config.roundRobinOrder : filtered.map((e) => e.id)).map(String);
  for (let attempts = 0; attempts < order.length + filtered.length; attempts += 1) {
    const id = order[config.rrIndex % order.length];
    config.rrIndex = (config.rrIndex + 1) % order.length;
    const emp = filtered.find((e) => String(e.id) === id);
    if (emp) return emp;
  }

  return filtered[0];
}

async function assignLead({ tenantId, leadId, employeeId, method = "manual", performedBy = "system", actor: a, reason }) {
  const lead = await repo.findLeadById(tenantId, leadId);
  if (!lead) throw new Error("Lead not found");

  const employee = await repo.findEmployeeById(tenantId, employeeId);
  if (!employee || employee.status !== "active") throw new Error("Employee not found or inactive");

  const before = { ...lead };
  const fromEmployeeId = lead.assignedTo?.id ?? lead.assignedTo;

  const updated = await repo.updateLead(tenantId, leadId, {
    assignedTo: employee.id,
    assignedAt: new Date(),
    assignedBy: performedBy,
    assignmentMethod: method,
    assignmentStatus: method === "manual" || method === "bulk" ? "assigned" : "pending",
    pipelineStage: "New Lead",
    status: "New Lead",
    acceptedAt: null,
    lastActivityAt: new Date(),
  });

  await repo.incrementEmployeeLeads(employee.id, 1);
  if (fromEmployeeId && String(fromEmployeeId) !== String(employee.id)) {
    await repo.incrementEmployeeLeads(fromEmployeeId, -1);
  }

  await repo.markQueueAssigned(tenantId, leadId);

  await repo.insertAssignmentHistory({
    tenantId,
    leadId,
    fromEmployeeId: fromEmployeeId || null,
    toEmployeeId: employee.id,
    method,
    performedBy,
    reason,
  });

  await writeTimeline({
    tenantId,
    leadId,
    type: "assignment",
    summary: `Lead assigned to ${employee.name}`,
    payload: { employeeId: employee.id, employeeName: employee.name, method },
    actor: a,
  });

  await writeAudit({
    tenantId,
    action: "lead.assigned",
    resource: "lead",
    resourceId: leadId,
    before,
    after: updated,
    metadata: { method, toEmployeeId: employee.id },
    actor: a,
  });

  await notify({
    tenantId,
    employeeId: employee.id,
    type: "lead_assigned",
    title: "New lead assigned",
    body: `${lead.leadName}${lead.companyName ? ` · ${lead.companyName}` : ""}`,
    entityType: "lead",
    entityId: leadId,
  });

  emitTenant(tenantId, "lead.assigned", updated);
  emitEmployee(tenantId, employee.id, "lead.assigned", updated);
  emitTenant(tenantId, "dashboard.refresh", { reason: "lead.assigned" });

  return updated;
}

async function processAssignmentQueue(tenantId, options = {}) {
  const config = await getOrCreateAssignmentConfig(tenantId);
  await resetDailyStatsIfNeeded(config);

  if (!config.autoAssign || config.mode === "manual_only") {
    return { processed: 0, skipped: "auto_assign_disabled" };
  }

  const limit = Number(options.limit || 25);
  const queueItems = await repo.getQueuedItems(tenantId, limit);

  let processed = 0;
  const failures = [];

  for (const item of queueItems) {
    await repo.updateQueueItem(item.id, { status: "processing", attempts: (item.attempts || 0) + 1 });

    const employee = await pickEmployee(tenantId, config);
    if (!employee) {
      await repo.updateQueueItem(item.id, { status: "failed", failureReason: "No eligible employees" });
      failures.push({ queueId: item.id, reason: "No eligible employees" });
      continue;
    }

    try {
      await assignLead({
        tenantId,
        leadId: item.leadId,
        employeeId: employee.id,
        method: config.mode === "workload" ? "workload" : "round_robin",
        performedBy: "assignment-engine",
        actor: options.actor,
      });
      setTodayCount(config, employee.id, todayCount(config, employee.id) + 1);
      config.todayStats.total = (config.todayStats.total || 0) + 1;
      processed += 1;
    } catch (err) {
      await repo.updateQueueItem(item.id, { status: "failed", failureReason: err.message });
      failures.push({ queueId: item.id, reason: err.message });
    }
  }

  await repo.saveAssignmentConfig(config);
  return { processed, failures };
}

async function bulkAssign({ tenantId, leadIds, employeeId, method = "bulk", actor: a }) {
  const results = [];
  for (const leadId of leadIds) {
    results.push(await assignLead({ tenantId, leadId, employeeId, method, performedBy: a?.actorId || "admin", actor: a }));
  }
  return results;
}

async function updateLeadStage({ tenantId, leadId, stage, status, actor: a }) {
  const lead = await repo.findLeadById(tenantId, leadId);
  if (!lead) throw new Error("Lead not found");
  const before = { ...lead };
  const from = lead.pipelineStage;

  const patch = {
    pipelineStage: stage,
    lastActivityAt: new Date(),
  };
  if (status) patch.status = status;
  if (stage === "won") patch.convertedAt = new Date();
  if (stage === "lost") patch.lostAt = new Date();

  const leavingNewLead = String(from || "").toLowerCase() === "new lead"
    && String(stage || "").toLowerCase() !== "new lead"
    && !lead.acceptedAt
    && String(lead.assignmentStatus || "").toLowerCase() === "assigned";
  if (leavingNewLead) {
    patch.assignmentStatus = "accepted";
    patch.acceptedAt = new Date();
  }

  const updated = await repo.updateLead(tenantId, leadId, patch);

  await writeTimeline({
    tenantId,
    leadId,
    type: "stage_change",
    summary: `Stage changed from ${from} to ${stage}`,
    payload: { from, to: stage, status },
    actor: a,
  });
  await writeAudit({ tenantId, action: "lead.stage_changed", resource: "lead", resourceId: leadId, before, after: updated, actor: a });
  emitTenant(tenantId, "lead.updated", updated);
  const assigneeId = updated.assignedTo?.id ?? updated.assignedTo;
  if (assigneeId) emitEmployee(tenantId, assigneeId, "lead.updated", updated);
  return updated;
}

async function addLeadNote({ tenantId, leadId, body, actor: a }) {
  const note = await repo.insertNote({
    tenantId,
    leadId,
    body,
    authorId: a?.actorId,
    authorType: a?.actorRole === "admin" ? "admin" : "employee",
  });
  await writeTimeline({ tenantId, leadId, type: "note", summary: "Note added", payload: { noteId: note.id, body }, actor: a });
  return note;
}

async function recordCall({ tenantId, data, actor: a }) {
  const call = await repo.insertCall({ tenantId, ...data });
  await repo.touchLeadActivity(tenantId, data.leadId);
  await writeTimeline({
    tenantId,
    leadId: data.leadId,
    type: "call",
    summary: `Call recorded: ${data.outcome || "logged"}`,
    payload: { callId: call.id, outcome: call.outcome, durationSec: call.durationSec },
    actor: a,
  });
  emitTenant(tenantId, "lead.updated", { leadId: data.leadId, reason: "call.recorded" });
  return call;
}

async function scheduleFollowup({ tenantId, data, actor: a }) {
  const task = await repo.insertTask({
    tenantId,
    assigneeId: data.employeeId,
    leadId: data.leadId,
    title: data.title || "Follow up with lead",
    description: data.note,
    priority: data.priority || "medium",
    dueAt: data.scheduledAt,
  });
  const followup = await repo.insertFollowup({ tenantId, ...data, taskId: task.id });
  await repo.updateTask(tenantId, task.id, { followUpId: followup.id });
  await repo.updateLead(tenantId, data.leadId, { nextFollowUpAt: data.scheduledAt, lastActivityAt: new Date() });
  await writeTimeline({
    tenantId,
    leadId: data.leadId,
    type: "followup",
    summary: "Follow-up scheduled",
    payload: { followupId: followup.id, scheduledAt: data.scheduledAt },
    actor: a,
  });
  await notify({
    tenantId,
    employeeId: data.employeeId,
    type: "followup_scheduled",
    title: "Follow-up scheduled",
    body: data.note,
    entityType: "followup",
    entityId: followup.id,
  });
  return followup;
}

async function completeFollowup({ tenantId, followupId, actor: a }) {
  const followup = await repo.updateFollowup(tenantId, followupId, {
    status: "completed",
    completedAt: new Date(),
  });
  if (!followup) throw new Error("Follow-up not found");
  if (followup.taskId) {
    await repo.updateTask(tenantId, followup.taskId, { status: "done", completedAt: new Date() });
  }
  await writeTimeline({ tenantId, leadId: followup.leadId, type: "followup", summary: "Follow-up completed", payload: { followupId }, actor: a });
  return followup;
}

async function createMeeting({ tenantId, data, actor: a }) {
  const meeting = await repo.insertMeeting({ tenantId, ...data });
  await writeTimeline({
    tenantId,
    leadId: data.leadId,
    type: "meeting",
    summary: "Meeting scheduled",
    payload: { meetingId: meeting.id, scheduledAt: meeting.scheduledAt },
    actor: a,
  });
  try {
    await notify({
      tenantId,
      employeeId: data.employeeId,
      type: "meeting_scheduled",
      title: "Meeting scheduled",
      body: data.title,
      entityType: "meeting",
      entityId: meeting.id,
    });
  } catch {
    // Meeting is already saved — notification failure must not fail the request.
  }
  return meeting;
}

async function addMom({ tenantId, meetingId, mom, actor: a }) {
  const meeting = await repo.updateMeeting(tenantId, meetingId, {
    mom: { ...mom, recordedAt: new Date() },
    status: "completed",
  });
  if (!meeting) throw new Error("Meeting not found");
  await writeTimeline({ tenantId, leadId: meeting.leadId, type: "mom", summary: "Minutes of Meeting added", payload: { meetingId, mom }, actor: a });
  return meeting;
}

async function getAdminKpis(tenantId, range = {}) {
  const key = `analytics:admin:kpis:${tenantId}:${range.start || "all"}:${range.end || "now"}`;
  const cached = await cacheGet(key);
  if (cached) return cached;

  const data = await repo.getAdminKpis(tenantId, range);
  await cacheSet(key, data, 300);
  return data;
}

async function getPipelineGrouped(tenantId, filters = {}) {
  return repo.getPipelineGrouped(tenantId, filters);
}

module.exports = {
  tenant,
  actor,
  normalizeLeadInput,
  createLead,
  assignLead,
  bulkAssign,
  processAssignmentQueue,
  getOrCreateAssignmentConfig,
  updateLeadStage,
  addLeadNote,
  recordCall,
  scheduleFollowup,
  completeFollowup,
  createMeeting,
  addMom,
  getAdminKpis,
  getPipelineGrouped,
  writeTimeline,
  writeAudit,
  notify,
};
