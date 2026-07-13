const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const repo = require("../repositories/operationalRepo");
const { listAllSops } = require("../controllers/sopController");
const {
  validate,
  createLeadSchema,
  assignSchema,
  bulkAssignSchema,
  stageSchema,
  noteSchema,
  callSchema,
  followupSchema,
  taskSchema,
  meetingSchema,
  meetingPatchSchema,
  momSchema,
  cashCollectionSchema,
} = require("../validators/operationalSchemas");
const pool = require("../../config/db");
const { requirePg } = require("../middleware/pgReady");
const {
  isAdminUser,
  authenticatedEmployeeId,
  requireEmployee,
  requireEmployeeSelf,
  requireEmployeeSelfBody,
  scopeEmployeeQuery,
} = require("../middleware/auth");
const {
  tenant,
  actor,
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
  scheduleLeadAssignments,
} = require("../services/operationalServices");
const callyzer = require("../services/callyzerService");

const router = express.Router();
const uploadDir = path.join(process.cwd(), "uploads");
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: Number(process.env.MAX_UPLOAD_BYTES || 10 * 1024 * 1024) },
});

router.use(requirePg);

function ok(res, data, extra = {}) {
  return res.json({ success: true, ...extra, data });
}

function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function parseRange(req) {
  return {
    start: req.query.from || req.query.start,
    end: req.query.to || req.query.end,
  };
}

function denyUnlessSelfOrAdmin(req, res, ownerEmployeeId) {
  if (isAdminUser(req)) return true;
  const selfId = authenticatedEmployeeId(req);
  if (!selfId) {
    res.status(403).json({ success: false, message: "Employee account is not linked to a profile" });
    return false;
  }
  if (Number(ownerEmployeeId) !== selfId) {
    res.status(403).json({ success: false, message: "You can only access your own data" });
    return false;
  }
  return true;
}

async function leadAssignedEmployeeId(tenantId, leadId) {
  const lead = await repo.findLeadById(tenantId, leadId);
  if (!lead) return { lead: null, assignedId: null };
  const raw = lead.assignedTo?.id ?? lead.assignedTo;
  return { lead, assignedId: raw != null ? Number(raw) : null };
}

function requireEmployeeOwnsLead(paramName = "id") {
  return asyncRoute(async (req, res, next) => {
    if (isAdminUser(req)) return next();
    if (req.user?.role !== "employee") return next();
    const selfId = authenticatedEmployeeId(req);
    if (!selfId) {
      return res.status(403).json({ success: false, message: "Employee account is not linked to a profile" });
    }
    const { lead, assignedId } = await leadAssignedEmployeeId(tenant(req), req.params[paramName]);
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    if (assignedId !== selfId) {
      return res.status(403).json({ success: false, message: "This lead is not assigned to you" });
    }
    return next();
  });
}

function requireEmployeeOwnsLeadBody(field = "leadId") {
  return asyncRoute(async (req, res, next) => {
    if (isAdminUser(req)) return next();
    if (req.user?.role !== "employee") return next();
    const selfId = authenticatedEmployeeId(req);
    if (!selfId) {
      return res.status(403).json({ success: false, message: "Employee account is not linked to a profile" });
    }
    const leadId = req.body?.[field];
    if (!leadId) return next();
    const { lead, assignedId } = await leadAssignedEmployeeId(tenant(req), leadId);
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    if (assignedId !== selfId) {
      return res.status(403).json({ success: false, message: "This lead is not assigned to you" });
    }
    return next();
  });
}

function scopeEmployeeLeadList(req) {
  if (isAdminUser(req)) return;
  if (req.user?.role !== "employee") return;
  const selfId = authenticatedEmployeeId(req);
  if (selfId) req.query.assignedTo = String(selfId);
}

router.post("/leads", validate(createLeadSchema), asyncRoute(async (req, res) => {
  const result = await createLead(req.body, { tenantId: tenant(req), actor: actor(req) });
  return ok(res, result);
}));

router.get("/leads", asyncRoute(async (req, res) => {
  scopeEmployeeLeadList(req);
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
  const { items, total } = await repo.listLeads(
    tenant(req),
    {
      assignmentStatus: req.query.assignmentStatus,
      assignedTo: req.query.assignedTo,
      status: req.query.status,
      pipelineStage: req.query.stage,
      source: req.query.source,
      temperature: req.query.temperature,
      q: req.query.q,
    },
    { page, limit },
  );
  return ok(res, items, { page, limit, total });
}));

router.get("/leads/:id", requireEmployeeOwnsLead(), asyncRoute(async (req, res) => {
  const lead = await repo.findLeadById(tenant(req), req.params.id, { populate: true });
  if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
  return ok(res, lead);
}));

router.put("/leads/:id", requireEmployeeOwnsLead(), asyncRoute(async (req, res) => {
  const lead = await repo.updateLead(tenant(req), req.params.id, { ...req.body, lastActivityAt: new Date() });
  if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
  await writeTimeline({ tenantId: tenant(req), leadId: lead.id, type: "status_change", summary: "Lead updated", payload: req.body, actor: actor(req) });
  return ok(res, lead);
}));

router.delete("/leads/:id", asyncRoute(async (req, res) => {
  if (req.user?.role === "employee") {
    return res.status(403).json({ success: false, message: "Employees cannot delete leads" });
  }
  const lead = await repo.softDeleteLead(tenant(req), req.params.id);
  return ok(res, lead);
}));

router.get("/leads/:id/timeline", requireEmployeeOwnsLead(), asyncRoute(async (req, res) => {
  const events = await repo.listTimeline(tenant(req), { leadId: req.params.id, limit: Number(req.query.limit || 100) });
  return ok(res, events);
}));

router.patch("/leads/:id/stage", validate(stageSchema), requireEmployeeOwnsLead(), asyncRoute(async (req, res) => {
  const lead = await updateLeadStage({ tenantId: tenant(req), leadId: req.params.id, stage: req.body.stage, status: req.body.status, actor: actor(req) });
  return ok(res, lead);
}));

router.patch("/leads/:id/qualification", requireEmployeeOwnsLead(), asyncRoute(async (req, res) => {
  const lead = await repo.updateLead(tenant(req), req.params.id, { qualification: req.body, lastActivityAt: new Date() });
  await writeTimeline({ tenantId: tenant(req), leadId: req.params.id, type: "qualification", summary: "Qualification updated", payload: req.body, actor: actor(req) });
  return ok(res, lead);
}));

router.patch("/leads/:id/budget", requireEmployeeOwnsLead(), asyncRoute(async (req, res) => {
  const lead = await repo.updateLead(tenant(req), req.params.id, { budget: req.body, lastActivityAt: new Date() });
  await writeTimeline({ tenantId: tenant(req), leadId: req.params.id, type: "budget", summary: "Budget updated", payload: req.body, actor: actor(req) });
  return ok(res, lead);
}));

router.post("/leads/:id/notes", validate(noteSchema), requireEmployeeOwnsLead(), asyncRoute(async (req, res) => {
  const note = await addLeadNote({ tenantId: tenant(req), leadId: req.params.id, body: req.body.body, actor: actor(req) });
  return ok(res, note);
}));

router.get("/leads/:id/notes", requireEmployeeOwnsLead(), asyncRoute(async (req, res) => {
  const notes = await repo.listNotes(tenant(req), req.params.id);
  return ok(res, notes);
}));

router.get("/leads/:id/cash-collections", requireEmployeeOwnsLead(), asyncRoute(async (req, res) => {
  const items = await repo.listCashCollectionsByLead(tenant(req), req.params.id);
  const total = await repo.sumCashByLead(tenant(req), req.params.id);
  return ok(res, items, { total });
}));

router.post("/leads/:id/cash-collections", upload.single("slip"), requireEmployeeOwnsLead(), asyncRoute(async (req, res) => {
  const body = {
    amount: req.body.amount,
    paymentMode: req.body.paymentMode || req.body.payment_mode,
    paymentAt: req.body.paymentAt || req.body.payment_at,
    transactionId: req.body.transactionId || req.body.transaction_id,
    notes: req.body.notes,
    employeeId: req.body.employeeId || req.body.employee_id,
    currency: req.body.currency,
  };

  const parsed = cashCollectionSchema.safeParse(body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: parsed.error.flatten(),
    });
  }

  const data = parsed.data;
  const transactionId = (data.transactionId || data.transaction_id || "").trim();
  const hasSlip = Boolean(req.file);
  if (!transactionId && !hasSlip) {
    return res.status(400).json({
      success: false,
      message: "Provide a transaction ID or upload a payment slip",
    });
  }

  const { lead, assignedId } = await leadAssignedEmployeeId(tenant(req), req.params.id);
  if (!lead) {
    return res.status(404).json({ success: false, message: "Lead not found" });
  }

  const employeeId = data.employeeId || data.employee_id || assignedId || authenticatedEmployeeId(req);
  const paymentAt = data.paymentAt || data.payment_at || new Date();
  const slipUrl = req.file ? `/uploads/${req.file.filename}` : null;
  const slipFilename = req.file ? req.file.originalname : null;

  const record = await repo.insertCashCollection({
    tenantId: tenant(req),
    leadId: Number(req.params.id),
    employeeId: employeeId ? Number(employeeId) : null,
    amount: data.amount,
    currency: data.currency || "INR",
    paymentMode: data.paymentMode || data.payment_mode,
    paymentAt,
    transactionId: transactionId || null,
    slipUrl,
    slipFilename,
    notes: data.notes || null,
    recordedBy: actor(req).actorName || actor(req).actorId,
  });

  await writeTimeline({
    tenantId: tenant(req),
    leadId: req.params.id,
    type: "payment",
    summary: `Cash collected: ₹${Number(data.amount).toLocaleString("en-IN")} via ${data.paymentMode || data.payment_mode}`,
    payload: { amount: data.amount, paymentMode: data.paymentMode || data.payment_mode, transactionId: transactionId || null },
    actor: actor(req),
  });

  const total = await repo.sumCashByLead(tenant(req), req.params.id);
  return ok(res, record, { total });
}));

router.get("/leads-queue", asyncRoute(async (req, res) => {
  const items = await repo.listQueue(tenant(req), { status: req.query.status });
  return ok(res, items);
}));

router.get("/assignment/config", asyncRoute(async (req, res) => {
  const config = await getOrCreateAssignmentConfig(tenant(req));
  return ok(res, config);
}));

router.put("/assignment/config", asyncRoute(async (req, res) => {
  const config = await repo.upsertAssignmentConfig(tenant(req), req.body);
  return ok(res, config);
}));

router.post("/assignment/assign", validate(assignSchema), asyncRoute(async (req, res) => {
  if (req.user?.role === "employee") {
    req.body.employeeId = authenticatedEmployeeId(req);
  }
  const lead = await assignLead({
    tenantId: tenant(req),
    leadId: req.body.leadId,
    employeeId: req.body.employeeId,
    method: req.body.method || "manual",
    reason: req.body.reason,
    performedBy: actor(req).actorId,
    actor: actor(req),
  });
  return ok(res, lead);
}));

router.post("/assignment/bulk-assign", validate(bulkAssignSchema), asyncRoute(async (req, res) => {
  if (req.user?.role === "employee") {
    return res.status(403).json({ success: false, message: "Only admins can bulk-assign leads" });
  }
  const results = await bulkAssign({
    tenantId: tenant(req),
    leadIds: req.body.leadIds,
    employeeId: req.body.employeeId,
    method: req.body.method || "bulk",
    actor: actor(req),
  });
  return ok(res, results, { count: results.length });
}));

router.post("/assignment/schedule-assign", asyncRoute(async (req, res) => {
  if (req.user?.role === "employee") {
    return res.status(403).json({ success: false, message: "Only admins can schedule lead assignments" });
  }
  const { leadIds, employeeId, startDate, leadsPerDay } = req.body;
  if (!leadIds || !employeeId || !startDate || !leadsPerDay) {
    return res.status(400).json({ success: false, message: "Missing required fields: leadIds, employeeId, startDate, leadsPerDay" });
  }
  const result = await scheduleLeadAssignments({
    tenantId: tenant(req),
    leadIds,
    employeeId,
    startDate,
    leadsPerDay,
    actor: actor(req),
  });
  return ok(res, result);
}));

router.post("/assignment/run-round-robin", asyncRoute(async (req, res) => {
  const result = await processAssignmentQueue(tenant(req), { limit: req.body.limit, actor: actor(req) });
  return ok(res, result);
}));

router.post("/assignment/employees/:id/pause", asyncRoute(async (req, res) => {
  const employee = await repo.updateEmployee(tenant(req), req.params.id, { receivingPaused: true });
  return ok(res, employee);
}));

router.post("/assignment/employees/:id/resume", asyncRoute(async (req, res) => {
  const employee = await repo.updateEmployee(tenant(req), req.params.id, { receivingPaused: false });
  return ok(res, employee);
}));

router.get("/assignment/audit", asyncRoute(async (req, res) => {
  const items = await repo.listAssignmentHistory(tenant(req), Number(req.query.limit || 200));
  return ok(res, items);
}));

router.get("/employees", asyncRoute(async (req, res) => {
  const employees = await repo.listEmployees(tenant(req), { status: req.query.status, q: req.query.q });
  return ok(res, employees);
}));

router.post("/employees", asyncRoute(async (req, res) => {
  const employee = await repo.createEmployee(tenant(req), req.body);
  return ok(res, employee);
}));

router.put("/employees/:id", asyncRoute(async (req, res) => {
  const employee = await repo.updateEmployee(tenant(req), req.params.id, req.body);
  return ok(res, employee);
}));

router.delete("/employees/:id", asyncRoute(async (req, res) => {
  const employee = await repo.updateEmployee(tenant(req), req.params.id, { status: "inactive" });
  return ok(res, employee);
}));

router.get("/employees/:id/leads", requireEmployeeSelf("id"), asyncRoute(async (req, res) => {
  const { items } = await repo.listLeads(tenant(req), { assignedTo: req.params.id }, { page: 1, limit: 500 });
  return ok(res, items);
}));

router.get("/employees/:id/cash-collections", requireEmployeeSelf("id"), asyncRoute(async (req, res) => {
  const items = await repo.listCashCollectionsByEmployee(tenant(req), req.params.id);
  const total = await repo.sumCashByEmployee(tenant(req), req.params.id);
  return ok(res, items, { total });
}));

router.get("/sops", asyncRoute(async (req, res) => {
  const sops = await listAllSops();
  return ok(res, sops);
}));

async function loadEmployeeDashboard(tenantId, employeeId) {
  const [employee, leadsResult, tasks, followups, dbCalls, meetings, sops] = await Promise.all([
    repo.findEmployeeById(tenantId, employeeId),
    repo.listLeads(tenantId, { assignedTo: employeeId }, { page: 1, limit: 500 }),
    repo.listTasks(tenantId, { assigneeId: employeeId, limit: 20 }),
    repo.listFollowups(tenantId, employeeId),
    repo.listCalls(tenantId, employeeId),
    repo.listMeetings(tenantId, employeeId),
    listAllSops().catch(() => []),
  ]);
  const calls = await callyzer.getCallsForEmployee(tenantId, employee, {
    dbCalls,
    leads: leadsResult.items,
    days: Number(process.env.CALLYZER_HISTORY_DAYS || 30),
  });
  return {
    employee,
    leads: leadsResult.items,
    tasks: tasks.slice(0, 20),
    followups: followups.slice(0, 20),
    calls: calls.slice(0, 200),
    meetings,
    sops,
    integrations: {
      callyzer: callyzer.isConfigured(),
    },
  };
}

router.get("/employee/me/dashboard", requireEmployee, asyncRoute(async (req, res) => {
  const employeeId = authenticatedEmployeeId(req);
  if (!employeeId) {
    return res.status(403).json({ success: false, message: "Employee account is not linked to a profile" });
  }
  const payload = await loadEmployeeDashboard(tenant(req), employeeId);
  return ok(res, payload);
}));

router.get("/employee/:employeeId/dashboard", requireEmployeeSelf(), asyncRoute(async (req, res) => {
  const payload = await loadEmployeeDashboard(tenant(req), req.params.employeeId);
  return ok(res, payload);
}));

router.get("/employee/:employeeId/leads", requireEmployeeSelf(), asyncRoute(async (req, res) => {
  const { items } = await repo.listLeads(
    tenant(req),
    { assignedTo: req.params.employeeId, status: req.query.status, temperature: req.query.temperature },
    { page: 1, limit: 500 },
  );
  return ok(res, items);
}));

router.get("/employee/:employeeId/tasks", requireEmployeeSelf(), asyncRoute(async (req, res) => {
  const tasks = await repo.listTasks(tenant(req), { assigneeId: req.params.employeeId, status: req.query.status });
  return ok(res, tasks);
}));

router.post("/employee/tasks", validate(taskSchema), requireEmployeeSelfBody("assigneeId"), asyncRoute(async (req, res) => {
  const tenantId = tenant(req);
  const assignee = await repo.findEmployeeById(tenantId, req.body.assigneeId);
  if (!assignee) {
    return res.status(400).json({
      success: false,
      message: `Employee ${req.body.assigneeId} not found. Add employees in Team or run DB seed.`,
    });
  }
  const task = await repo.insertTask({ tenantId, ...req.body });
  if (!task?.id) {
    return res.status(500).json({ success: false, message: "Task insert failed — no id returned" });
  }
  return ok(res, task);
}));

router.patch("/employee/tasks/:id", asyncRoute(async (req, res) => {
  const tenantId = tenant(req);
  const existing = await repo.findTaskById(tenantId, req.params.id);
  if (!existing) return res.status(404).json({ success: false, message: "Task not found" });
  if (!denyUnlessSelfOrAdmin(req, res, existing.assigneeId)) return;
  const patch = { ...req.body };
  if (patch.status === "done" && !patch.completedAt) patch.completedAt = new Date();
  const task = await repo.updateTask(tenantId, req.params.id, patch);
  return ok(res, task);
}));

router.post("/employee/calls", validate(callSchema), requireEmployeeSelfBody("employeeId"), requireEmployeeOwnsLeadBody("leadId"), asyncRoute(async (req, res) => {
  const tenantId = tenant(req);
  const [lead, employee] = await Promise.all([
    repo.findLeadById(tenantId, req.body.leadId),
    repo.findEmployeeById(tenantId, req.body.employeeId),
  ]);
  if (!lead) {
    return res.status(400).json({ success: false, message: `Lead ${req.body.leadId} not found` });
  }
  if (!employee) {
    return res.status(400).json({ success: false, message: `Employee ${req.body.employeeId} not found` });
  }
  const call = await recordCall({ tenantId, data: req.body, actor: actor(req) });
  return ok(res, call);
}));

router.put("/employee/calls/:id", asyncRoute(async (req, res) => {
  const tenantId = tenant(req);
  const callId = req.params.id;
  const { leadId } = req.body;
  if (!leadId) {
    return res.status(400).json({ success: false, message: "leadId is required" });
  }
  const lead = await repo.findLeadById(tenantId, leadId);
  if (!lead) {
    return res.status(400).json({ success: false, message: "Lead not found" });
  }
  await pool.query(
    "UPDATE employee_calls SET lead_id = $1 WHERE tenant_id = $2 AND id = $3",
    [leadId, tenantId, callId]
  );
  return ok(res, { success: true });
}));

router.post("/employee/callyzer/start-call", requireEmployeeSelfBody("employeeId"), requireEmployeeOwnsLeadBody("leadId"), asyncRoute(async (req, res) => {
  const tenantId = tenant(req);
  const [lead, employee] = await Promise.all([
    repo.findLeadById(tenantId, req.body.leadId),
    repo.findEmployeeById(tenantId, req.body.employeeId),
  ]);
  if (!lead) {
    return res.status(404).json({ success: false, message: "Lead not found" });
  }
  if (!employee) {
    return res.status(404).json({ success: false, message: "Employee not found" });
  }
  if (!lead.phone) {
    return res.status(400).json({ success: false, message: "Lead phone number is required before calling" });
  }

  const session = await callyzer.prepareLeadCall({ lead, employee });
  const sourceMeta = {
    ...(lead.sourceMeta || {}),
    callyzerLeadId: session.callyzerLeadId || lead.sourceMeta?.callyzerLeadId || null,
    lastCallyzerDialAt: session.startedAt,
    lastCallyzerDialBy: employee.id,
  };
  await repo.updateLead(tenantId, lead.id, { sourceMeta });

  return ok(res, {
    ...session,
    leadName: lead.leadName,
    message: "Lead synced to Callyzer. Place the call from your phone — Callyzer will record it under this lead.",
  });
}));

router.get("/employee/:employeeId/calls", requireEmployeeSelf(), asyncRoute(async (req, res) => {
  const tenantId = tenant(req);
  const employeeId = req.params.employeeId;
  const [employee, dbCalls, leadsResult] = await Promise.all([
    repo.findEmployeeById(tenantId, employeeId),
    repo.listCalls(tenantId, employeeId),
    repo.listLeads(tenantId, { assignedTo: employeeId }, { page: 1, limit: 500 }),
  ]);
  const calls = await callyzer.getCallsForEmployee(tenantId, employee, {
    dbCalls,
    leads: leadsResult.items,
    days: Number(req.query.days || process.env.CALLYZER_HISTORY_DAYS || 30),
  });
  return ok(res, calls);
}));

router.get("/employee/:employeeId/callyzer/stats", requireEmployeeSelf(), asyncRoute(async (req, res) => {
  const tenantId = tenant(req);
  const employeeId = req.params.employeeId;
  const month = req.query.month; // e.g. "2026-07"
  const period = String(req.query.period || "today").toLowerCase();

  let dateWhere = "1=1";
  let params = [tenantId, employeeId];

  if (month) {
    dateWhere = "DATE_FORMAT(COALESCE(started_at, created_at), '%Y-%m') = $3";
    params.push(month);
  } else if (period === "today") {
    dateWhere = "DATE(COALESCE(started_at, created_at)) = CURRENT_DATE()";
  } else if (period === "yesterday") {
    dateWhere = "DATE(COALESCE(started_at, created_at)) = CURRENT_DATE() - INTERVAL 1 DAY";
  } else if (period === "this_month" || period === "month") {
    dateWhere = "DATE_FORMAT(COALESCE(started_at, created_at), '%Y-%m') = DATE_FORMAT(CURRENT_DATE(), '%Y-%m')";
  } else if (period === "last_month") {
    dateWhere = "DATE_FORMAT(COALESCE(started_at, created_at), '%Y-%m') = DATE_FORMAT(CURRENT_DATE() - INTERVAL 1 MONTH, '%Y-%m')";
  }

  const queryText = `
    SELECT 
      COUNT(*) AS total_calls,
      SUM(CASE WHEN duration_sec > 0 THEN 1 ELSE 0 END) AS connected_calls,
      AVG(duration_sec) AS avg_duration_sec
    FROM employee_calls
    WHERE tenant_id = $1 AND employee_id = $2 AND ${dateWhere}
  `;

  const result = await pool.query(queryText, params);
  const row = result.rows[0] || {};
  const total = Number(row.total_calls) || 0;
  const connected = Number(row.connected_calls) || 0;
  const avgDurationSec = Math.round(Number(row.avg_duration_sec) || 0);
  const pickupRate = total > 0 ? Math.min(100, Math.round((connected / total) * 100)) : 0;

  return ok(res, {
    success: true,
    configured: true,
    stats: {
      total,
      connectedCalls: connected,
      pickupRate,
      avgDurationSec
    },
    period: month || period
  });
}));

router.post("/employee/followups", validate(followupSchema), requireEmployeeSelfBody("employeeId"), requireEmployeeOwnsLeadBody("leadId"), asyncRoute(async (req, res) => {
  const followup = await scheduleFollowup({ tenantId: tenant(req), data: req.body, actor: actor(req) });
  return ok(res, followup);
}));

router.patch("/employee/followups/:id/complete", asyncRoute(async (req, res) => {
  const tenantId = tenant(req);
  const existing = await repo.findFollowupById(tenantId, req.params.id);
  if (!existing) return res.status(404).json({ success: false, message: "Follow-up not found" });
  if (!denyUnlessSelfOrAdmin(req, res, existing.employeeId)) return;
  const followup = await completeFollowup({ tenantId, followupId: req.params.id, actor: actor(req) });
  return ok(res, followup);
}));

router.get("/employee/:employeeId/followups", requireEmployeeSelf(), asyncRoute(async (req, res) => {
  const followups = await repo.listFollowups(tenant(req), req.params.employeeId);
  return ok(res, followups);
}));

router.post("/employee/meetings", validate(meetingSchema), requireEmployeeSelfBody("employeeId"), requireEmployeeOwnsLeadBody("leadId"), asyncRoute(async (req, res) => {
  const tenantId = tenant(req);
  const [lead, employee] = await Promise.all([
    repo.findLeadById(tenantId, req.body.leadId),
    repo.findEmployeeById(tenantId, req.body.employeeId),
  ]);
  if (!lead) {
    return res.status(400).json({ success: false, message: `Lead ${req.body.leadId} not found` });
  }
  if (!employee) {
    return res.status(400).json({ success: false, message: `Employee ${req.body.employeeId} not found` });
  }
  const meeting = await createMeeting({ tenantId, data: req.body, actor: actor(req) });
  if (!meeting?.id) {
    return res.status(500).json({ success: false, message: "Meeting insert failed — no id returned" });
  }
  return ok(res, meeting);
}));

router.patch("/employee/meetings/:id", validate(meetingPatchSchema), asyncRoute(async (req, res) => {
  const tenantId = tenant(req);
  const existing = await repo.findMeetingById(tenantId, req.params.id);
  if (!existing) return res.status(404).json({ success: false, message: "Meeting not found" });
  if (!denyUnlessSelfOrAdmin(req, res, existing.employeeId)) return;
  const meeting = await repo.updateMeeting(tenantId, req.params.id, req.body);
  if (!meeting) return res.status(404).json({ success: false, message: "Meeting not found" });
  return ok(res, meeting);
}));

router.patch("/employee/meetings/:id/mom", validate(momSchema), asyncRoute(async (req, res) => {
  const tenantId = tenant(req);
  const existing = await repo.findMeetingById(tenantId, req.params.id);
  if (!existing) return res.status(404).json({ success: false, message: "Meeting not found" });
  if (!denyUnlessSelfOrAdmin(req, res, existing.employeeId)) return;
  const meeting = await addMom({ tenantId, meetingId: req.params.id, mom: req.body, actor: actor(req) });
  return ok(res, meeting);
}));

router.get("/employee/:employeeId/meetings", requireEmployeeSelf(), asyncRoute(async (req, res) => {
  const meetings = await repo.listMeetings(tenant(req), req.params.employeeId);
  return ok(res, meetings);
}));

router.get("/analytics/admin/kpis", asyncRoute(async (req, res) => {
  const data = await getAdminKpis(tenant(req), parseRange(req));
  return ok(res, data);
}));

router.get("/analytics/pipeline", asyncRoute(async (req, res) => {
  const data = await getPipelineGrouped(tenant(req), req.query);
  return ok(res, data);
}));

router.get("/analytics/leaderboard", asyncRoute(async (req, res) => {
  const rows = await repo.getLeaderboard(tenant(req), Number(req.query.limit || 10));
  return ok(res, rows);
}));

router.get("/notifications", scopeEmployeeQuery("employeeId"), asyncRoute(async (req, res) => {
  const items = await repo.listNotifications(
    tenant(req),
    { employeeId: req.query.employeeId, unread: req.query.unread === "true" },
    Number(req.query.limit || 50),
  );
  return ok(res, items);
}));

router.post("/notifications/read", scopeEmployeeQuery("employeeId"), asyncRoute(async (req, res) => {
  await repo.markNotificationsRead(tenant(req), { ids: req.body.ids, employeeId: req.body.employeeId });
  return ok(res, { read: true });
}));

router.get("/activity/timeline", asyncRoute(async (req, res) => {
  const items = await repo.listTimeline(tenant(req), { leadId: req.query.leadId, limit: Number(req.query.limit || 100) });
  return ok(res, items);
}));

router.get("/audit", asyncRoute(async (req, res) => {
  const items = await repo.listAudit(tenant(req), Number(req.query.limit || 200));
  return ok(res, items);
}));

router.post("/webhooks/n8n", validate(createLeadSchema), asyncRoute(async (req, res) => {
  const result = await createLead(
    { ...req.body, source: "n8n", rawPayload: req.body },
    { tenantId: tenant(req), actor: { actorId: "webhook:n8n", actorName: "n8n Webhook", actorRole: "integration" } },
  );
  return res.status(202).json({ success: true, leadId: result.lead.id, queueId: result.queueItem.id });
}));

router.post("/webhooks/callyzer", asyncRoute(async (req, res) => {
  if (!callyzer.verifyWebhookSecret(req)) {
    return res.status(401).json({ success: false, message: "Invalid webhook secret" });
  }

  const tenantId = process.env.CALLYZER_TENANT_ID || "default";
  const payloads = Array.isArray(req.body) ? req.body : [req.body];
  const employees = await repo.listEmployees(tenantId);
  let synced = 0;
  let skipped = 0;

  for (const block of payloads) {
    const employee = employees.find((emp) => callyzer.employeeMatchesWebhook(emp, block));
    if (!employee) {
      skipped += Array.isArray(block.call_logs) ? block.call_logs.length : 0;
      continue;
    }

    const { items: assignedLeads } = await repo.listLeads(
      tenantId,
      { assignedTo: employee.id },
      { page: 1, limit: 500 },
    );
    const phoneIndex = callyzer.buildLeadPhoneIndex(assignedLeads);

    const logs = Array.isArray(block.call_logs) ? block.call_logs : [];
    for (const log of logs) {
      if (!log?.id) continue;
      let lead = callyzer.findLeadForClient(assignedLeads, log.client_country_code, log.client_number);
      if (!lead) {
        lead = await repo.findLeadByPhone(tenantId, log.client_number, { assignedTo: employee.id });
      }
      
      if (!lead) {
        const clientPhone = callyzer.normalizePhone(log.client_country_code, log.client_number).full || log.client_number;
        const leadName = log.client_name || "Unknown Lead";
        
        const existingLead = await repo.findLeadByPhone(tenantId, clientPhone);
        if (existingLead) {
          lead = existingLead;
        } else {
          try {
            const { lead: newLead } = await createLead({
              leadName,
              phone: clientPhone,
              source: "Callyzer",
              pipelineStage: "Contacted",
              status: "Contacted",
              temperature: "warm",
              assignedTo: employee.id,
            }, { tenantId, autoAssign: false, actor: { actorId: `employee:${employee.id}`, actorName: employee.name, actorRole: "employee" } });
            lead = newLead;
          } catch (e) {
            console.error("Failed to auto-create lead in webhook", e);
          }
        }
      }

      const leadId = lead?.id || callyzer.resolveLeadIdForLog(log, assignedLeads, phoneIndex);
      const mapped = callyzer.mapLogToCall(log, employee.id, leadId);
      try {
        await repo.upsertCallyzerCall({
          tenantId,
          leadId: mapped.leadId,
          employeeId: employee.id,
          callyzerCallId: mapped.callyzerCallId,
          direction: mapped.direction,
          outcome: mapped.outcome,
          durationSec: mapped.durationSec,
          startedAt: mapped.startedAt,
          endedAt: mapped.endedAt,
          recordingUrl: mapped.recordingUrl,
          notes: mapped.notes,
          aiSummary: mapped.aiSummary,
        });
        synced += 1;
      } catch {
        skipped += 1;
      }
    }
  }

  return res.status(200).json({ success: true, synced, skipped });
}));

router.get("/callyzer/status", asyncRoute(async (req, res) => {
  if (!isAdminUser(req)) {
    return res.status(403).json({ success: false, message: "Admin access required" });
  }
  return ok(res, {
    configured: callyzer.isConfigured(),
    webhookUrl: "/api/v1/webhooks/callyzer",
  });
}));

router.get("/callyzer/team-stats", asyncRoute(async (req, res) => {
  if (!isAdminUser(req)) {
    return res.status(403).json({ success: false, message: "Admin access required" });
  }
  if (!callyzer.isConfigured()) {
    return ok(res, { configured: false, stats: [], message: "Callyzer API key not configured" });
  }
  const period = String(req.query.period || "today").toLowerCase();
  try {
    const stats = await callyzer.fetchTeamSummary(period);
    return ok(res, { configured: true, period, stats });
  } catch (err) {
    return res.status(502).json({ success: false, message: err.message || "Could not fetch Callyzer team stats" });
  }
}));

router.post("/webhooks/forms/:formId/submit", validate(createLeadSchema), asyncRoute(async (req, res) => {
  const result = await createLead(
    { ...req.body, source: "form", sourceMeta: { formId: req.params.formId, rawPayload: req.body } },
    { tenantId: tenant(req), actor: { actorId: `form:${req.params.formId}`, actorName: "Website Form", actorRole: "integration" } },
  );
  return res.status(202).json({ success: true, leadId: result.lead.id, queueId: result.queueItem.id });
}));

router.post("/files/upload", upload.single("file"), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: "file is required" });
  const asset = await repo.insertFileAsset({
    tenantId: tenant(req),
    uploadedBy: actor(req).actorId,
    entityType: req.body.entityType,
    entityId: req.body.entityId,
    filename: req.file.filename,
    originalName: req.file.originalname,
    mime: req.file.mimetype,
    size: req.file.size,
    storageKey: req.file.path,
    url: `/uploads/${req.file.filename}`,
  });
  return ok(res, asset);
}));

module.exports = router;
