const pool = require("../../config/db");

const DEFAULT_TENANT_ID = "default";

function withId(row, mapper) {
  if (!row) return null;
  const mapped = mapper ? mapper(row) : row;
  const id = mapped.id ?? row.id;
  return { ...mapped, id, _id: id };
}

function mapLead(row, assignedEmployee) {
  if (!row) return null;
  const lead = {
    id: row.id,
    tenantId: row.tenant_id,
    leadName: row.lead_name,
    companyName: row.company_name,
    phone: row.phone,
    email: row.email,
    city: row.city,
    country: row.country,
    source: row.source,
    sourceMeta: row.source_meta || {},
    formName: row.form_name,
    pipelineStage: row.pipeline_stage,
    temperature: row.temperature,
    status: row.status,
    winProbability: Number(row.win_probability || 0),
    expectedRevenue: Number(row.expected_revenue || 0),
    currency: row.currency,
    priority: row.priority,
    assignmentStatus: row.assignment_status,
    assignedTo: row.assigned_to,
    assignedAt: row.assigned_at,
    assignedBy: row.assigned_by,
    assignmentMethod: row.assignment_method,
    acceptedAt: row.accepted_at,
    qualification: row.qualification || {},
    budget: row.budget || {},
    requirements: row.requirements,
    insights: row.insights,
    tags: row.tags || [],
    lastActivityAt: row.last_activity_at,
    nextFollowUpAt: row.next_follow_up_at,
    convertedAt: row.converted_at,
    lostAt: row.lost_at,
    isDeleted: row.is_deleted,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (assignedEmployee) {
    const empId = assignedEmployee.id ?? assignedEmployee.emp_id;
    lead.assignedTo = {
      id: empId,
      _id: empId,
      name: assignedEmployee.name ?? assignedEmployee.emp_name,
      email: assignedEmployee.email ?? assignedEmployee.emp_email,
      role: assignedEmployee.role ?? assignedEmployee.emp_role,
      department: assignedEmployee.department ?? assignedEmployee.emp_department,
    };
  }
  return withId(lead);
}

function mapEmployee(row) {
  if (!row) return null;
  return withId({
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    department: row.department,
    status: row.status,
    avatarUrl: row.avatar_url,
    initials: row.initials,
    salary: row.salary != null ? Number(row.salary) : null,
    joiningDate: row.joining_date,
    managerId: row.manager_id,
    territory: row.territory,
    city: row.city,
    capacity: {
      maxActiveLeads: row.max_active_leads ?? 40,
      currentActiveLeads: row.current_active_leads ?? 0,
      receivingPaused: row.receiving_paused ?? false,
      dailyLimit: row.daily_limit ?? 25,
    },
    metrics: row.metrics || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapQueueItem(row, leadRow) {
  if (!row) return null;
  const item = withId({
    id: row.id,
    tenantId: row.tenant_id,
    leadId: row.lead_id,
    status: row.status,
    priority: row.priority,
    queuedAt: row.queued_at,
    processedAt: row.processed_at,
    failureReason: row.failure_reason,
    attempts: row.attempts,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
  if (leadRow) item.lead = mapLead(leadRow);
  return item;
}

function mapConfig(row) {
  if (!row) return null;
  const todayStats = row.today_stats || { total: 0, byEmployee: {} };
  return withId({
    id: row.id,
    tenantId: row.tenant_id,
    mode: row.mode,
    autoAssign: row.auto_assign,
    roundRobinOrder: row.round_robin_order || [],
    rrIndex: row.rr_index,
    pausedEmployees: row.paused_employees || [],
    workloadRules: row.workload_rules || {},
    todayKey: row.today_key,
    todayStats,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapTimeline(row) {
  if (!row) return null;
  return withId({
    id: row.id,
    tenantId: row.tenant_id,
    leadId: row.lead_id,
    type: row.type,
    actorId: row.actor_id,
    actorName: row.actor_name,
    actorRole: row.actor_role,
    summary: row.summary,
    payload: row.payload || {},
    createdAt: row.created_at,
  });
}

function mapNotification(row) {
  if (!row) return null;
  return withId({
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    employeeId: row.employee_id,
    type: row.type,
    title: row.title,
    body: row.body,
    entityType: row.entity_type,
    entityId: row.entity_id,
    isRead: row.is_read,
    createdAt: row.created_at,
  });
}

function mapNote(row) {
  if (!row) return null;
  return withId({
    id: row.id,
    tenantId: row.tenant_id,
    leadId: row.lead_id,
    authorId: row.author_id,
    authorType: row.author_type,
    body: row.body,
    isPinned: row.is_pinned,
    createdAt: row.created_at,
  });
}

function mapCall(row) {
  if (!row) return null;
  return withId({
    id: row.id,
    tenantId: row.tenant_id,
    leadId: row.lead_id,
    employeeId: row.employee_id,
    direction: row.direction,
    outcome: row.outcome,
    durationSec: row.duration_sec,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    sopId: row.sop_id,
    checklistProgress: row.checklist_progress || [],
    recordingUrl: row.recording_url,
    transcript: row.transcript,
    notes: row.notes,
    aiSummary: row.ai_summary,
    createdAt: row.created_at,
  });
}

function mapFollowup(row) {
  if (!row) return null;
  return withId({
    id: row.id,
    tenantId: row.tenant_id,
    leadId: row.lead_id,
    employeeId: row.employee_id,
    taskId: row.task_id,
    scheduledAt: row.scheduled_at,
    note: row.note,
    status: row.status,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  });
}

function mapMeeting(row) {
  if (!row) return null;
  return withId({
    id: row.id,
    tenantId: row.tenant_id,
    leadId: row.lead_id,
    employeeId: row.employee_id,
    title: row.title,
    scheduledAt: row.scheduled_at,
    durationMin: row.duration_min,
    meetLink: row.meet_link,
    location: row.location,
    status: row.status,
    mom: row.mom || {},
    createdAt: row.created_at,
  });
}

function mapTask(row) {
  if (!row) return null;
  return withId({
    id: row.id,
    tenantId: row.tenant_id,
    assigneeId: row.assignee_id,
    leadId: row.lead_id,
    followUpId: row.follow_up_id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    dueAt: row.due_at,
    status: row.status,
    sopChecklist: row.sop_checklist || [],
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapHistory(row) {
  if (!row) return null;
  return withId({
    id: row.id,
    tenantId: row.tenant_id,
    leadId: row.lead_id,
    fromEmployeeId: row.from_employee_id,
    toEmployeeId: row.to_employee_id,
    method: row.method,
    performedBy: row.performed_by,
    reason: row.reason,
    metadata: row.metadata || {},
    createdAt: row.created_at,
  });
}

function mapAudit(row) {
  if (!row) return null;
  return withId({
    id: row.id,
    tenantId: row.tenant_id,
    actorId: row.actor_id,
    action: row.action,
    resource: row.resource,
    resourceId: row.resource_id,
    before: row.before_state,
    after: row.after_state,
    ip: row.ip,
    metadata: row.metadata || {},
    createdAt: row.created_at,
  });
}

function mapFileAsset(row) {
  if (!row) return null;
  return withId({
    id: row.id,
    tenantId: row.tenant_id,
    uploadedBy: row.uploaded_by,
    entityType: row.entity_type,
    entityId: row.entity_id,
    filename: row.filename,
    originalName: row.original_name,
    mime: row.mime,
    size: row.size,
    storageKey: row.storage_key,
    url: row.url,
    createdAt: row.created_at,
  });
}

const LEAD_SELECT = `
  l.*,
  e.id AS emp_id, e.name AS emp_name, e.email AS emp_email, e.role AS emp_role, e.department AS emp_department
`;

function joinEmployee(row) {
  if (!row || !row.assigned_to) return null;
  return {
    id: row.emp_id,
    name: row.emp_name,
    email: row.emp_email,
    role: row.emp_role,
    department: row.emp_department,
  };
}

async function insertLead(tenantId, data) {
  const result = await pool.query(
    `INSERT INTO leads (
      tenant_id, lead_name, company_name, phone, email, city, country,
      source, source_meta, form_name, pipeline_stage, temperature, status,
      win_probability, expected_revenue, currency, priority, assignment_status,
      requirements, insights, last_activity_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'unassigned',$18,$19,NOW()
    ) RETURNING *`,
    [
      tenantId,
      data.leadName,
      data.companyName || null,
      data.phone || null,
      data.email || null,
      data.city || null,
      data.country || "India",
      data.source || "manual",
      JSON.stringify(data.sourceMeta || {}),
      data.formName || null,
      data.pipelineStage || "new",
      data.temperature || "warm",
      data.status || "New Lead",
      data.winProbability ?? 0,
      data.expectedRevenue ?? 0,
      data.currency || "INR",
      data.priority || "medium",
      data.requirements || null,
      data.insights || null,
    ],
  );
  return mapLead(result.rows[0]);
}

async function findLeadById(tenantId, leadId, { populate = false } = {}) {
  const result = await pool.query(
    populate
      ? `SELECT ${LEAD_SELECT} FROM leads l LEFT JOIN employees e ON e.id = l.assigned_to WHERE l.id = $1 AND l.tenant_id = $2 AND l.is_deleted = false`
      : `SELECT * FROM leads WHERE id = $1 AND tenant_id = $2 AND is_deleted = false`,
    [leadId, tenantId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return populate ? mapLead(row, joinEmployee(row)) : mapLead(row);
}

async function listLeads(tenantId, filters = {}, { page = 1, limit = 50 } = {}) {
  const conditions = ["l.tenant_id = $1", "l.is_deleted = false"];
  const params = [tenantId];
  let idx = 2;

  const add = (sql, val) => {
    conditions.push(sql.replace("?", `$${idx}`));
    params.push(val);
    idx += 1;
  };

  if (filters.assignmentStatus) add("l.assignment_status = ?", filters.assignmentStatus);
  if (filters.assignedTo) add("l.assigned_to = ?", filters.assignedTo);
  if (filters.status) add("l.status = ?", filters.status);
  if (filters.pipelineStage) add("l.pipeline_stage = ?", filters.pipelineStage);
  if (filters.source) add("l.source = ?", filters.source);
  if (filters.temperature) add("l.temperature = ?", filters.temperature);
  if (filters.q) {
    conditions.push(`(
      l.lead_name ILIKE $${idx} OR l.company_name ILIKE $${idx}
      OR l.phone ILIKE $${idx} OR l.email ILIKE $${idx}
    )`);
    params.push(`%${filters.q}%`);
    idx += 1;
  }

  const where = conditions.join(" AND ");
  const offset = (page - 1) * limit;

  const [itemsRes, countRes] = await Promise.all([
    pool.query(
      `SELECT ${LEAD_SELECT} FROM leads l
       LEFT JOIN employees e ON e.id = l.assigned_to
       WHERE ${where}
       ORDER BY l.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset],
    ),
    pool.query(`SELECT COUNT(*)::int AS total FROM leads l WHERE ${where}`, params),
  ]);

  return {
    items: itemsRes.rows.map((r) => mapLead(r, joinEmployee(r))),
    total: countRes.rows[0].total,
  };
}

async function updateLead(tenantId, leadId, patch) {
  const fields = [];
  const params = [tenantId, leadId];
  let idx = 3;

  const map = {
    leadName: "lead_name",
    companyName: "company_name",
    phone: "phone",
    email: "email",
    city: "city",
    country: "country",
    source: "source",
    sourceMeta: "source_meta",
    formName: "form_name",
    pipelineStage: "pipeline_stage",
    temperature: "temperature",
    status: "status",
    winProbability: "win_probability",
    expectedRevenue: "expected_revenue",
    currency: "currency",
    priority: "priority",
    assignmentStatus: "assignment_status",
    assignedTo: "assigned_to",
    assignedAt: "assigned_at",
    assignedBy: "assigned_by",
    assignmentMethod: "assignment_method",
    acceptedAt: "accepted_at",
    qualification: "qualification",
    budget: "budget",
    requirements: "requirements",
    insights: "insights",
    tags: "tags",
    lastActivityAt: "last_activity_at",
    nextFollowUpAt: "next_follow_up_at",
    convertedAt: "converted_at",
    lostAt: "lost_at",
    isDeleted: "is_deleted",
  };

  for (const [key, col] of Object.entries(map)) {
    if (patch[key] !== undefined) {
      let val = patch[key];
      if (["sourceMeta", "qualification", "budget", "tags"].includes(key)) {
        val = JSON.stringify(val);
      }
      fields.push(`${col} = $${idx}`);
      params.push(val);
      idx += 1;
    }
  }

  if (!fields.length) return findLeadById(tenantId, leadId);

  fields.push("updated_at = NOW()");
  const result = await pool.query(
    `UPDATE leads SET ${fields.join(", ")} WHERE tenant_id = $1 AND id = $2 AND is_deleted = false RETURNING *`,
    params,
  );
  return mapLead(result.rows[0]);
}

async function softDeleteLead(tenantId, leadId) {
  return updateLead(tenantId, leadId, { isDeleted: true });
}

async function touchLeadActivity(tenantId, leadId) {
  await pool.query(
    `UPDATE leads SET last_activity_at = NOW(), updated_at = NOW() WHERE tenant_id = $1 AND id = $2`,
    [tenantId, leadId],
  );
}

async function insertQueueItem(tenantId, leadId, priority) {
  const result = await pool.query(
    `INSERT INTO lead_assignment_queue (tenant_id, lead_id, priority, status, queued_at)
     VALUES ($1, $2, $3, 'queued', NOW()) RETURNING *`,
    [tenantId, leadId, priority],
  );
  return mapQueueItem(result.rows[0]);
}

async function listQueue(tenantId, { status } = {}) {
  const params = [tenantId];
  let sql = `
    SELECT
      q.id, q.tenant_id, q.lead_id, q.status, q.priority, q.queued_at,
      q.processed_at, q.failure_reason, q.attempts, q.created_at, q.updated_at,
      l.lead_name, l.company_name, l.phone, l.email, l.pipeline_stage,
      l.temperature, l.status AS lead_status, l.assignment_status, l.created_at AS lead_created_at
    FROM lead_assignment_queue q
    JOIN leads l ON l.id = q.lead_id
    WHERE q.tenant_id = $1
  `;
  if (status) {
    params.push(status);
    sql += ` AND q.status = $2`;
  }
  sql += ` ORDER BY q.priority DESC, q.queued_at ASC`;
  const result = await pool.query(sql, params);
  return result.rows.map((row) => {
    const q = {
      id: row.id,
      tenant_id: row.tenant_id,
      lead_id: row.lead_id,
      status: row.status,
      priority: row.priority,
      queued_at: row.queued_at,
      processed_at: row.processed_at,
      failure_reason: row.failure_reason,
      attempts: row.attempts,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
    const lead = {
      id: row.lead_id,
      tenant_id: row.tenant_id,
      lead_name: row.lead_name,
      company_name: row.company_name,
      phone: row.phone,
      email: row.email,
      pipeline_stage: row.pipeline_stage,
      temperature: row.temperature,
      status: row.lead_status,
      assignment_status: row.assignment_status,
      created_at: row.lead_created_at,
    };
    return mapQueueItem(q, lead);
  });
}

async function getQueuedItems(tenantId, limit) {
  const result = await pool.query(
    `SELECT * FROM lead_assignment_queue
     WHERE tenant_id = $1 AND status = 'queued'
     ORDER BY priority DESC, queued_at ASC
     LIMIT $2`,
    [tenantId, limit],
  );
  return result.rows.map((r) => mapQueueItem(r));
}

async function updateQueueItem(id, patch) {
  const fields = [];
  const params = [id];
  let idx = 2;
  for (const [key, col] of Object.entries({
    status: "status",
    processedAt: "processed_at",
    failureReason: "failure_reason",
    attempts: "attempts",
  })) {
    if (patch[key] !== undefined) {
      fields.push(`${col} = $${idx}`);
      params.push(patch[key]);
      idx += 1;
    }
  }
  if (!fields.length) return null;
  fields.push("updated_at = NOW()");
  const result = await pool.query(
    `UPDATE lead_assignment_queue SET ${fields.join(", ")} WHERE id = $1 RETURNING *`,
    params,
  );
  return mapQueueItem(result.rows[0]);
}

async function markQueueAssigned(tenantId, leadId) {
  await pool.query(
    `UPDATE lead_assignment_queue SET status = 'assigned', processed_at = NOW(), updated_at = NOW()
     WHERE tenant_id = $1 AND lead_id = $2`,
    [tenantId, leadId],
  );
}

async function getAssignmentConfig(tenantId) {
  const result = await pool.query(`SELECT * FROM assignment_config WHERE tenant_id = $1`, [tenantId]);
  return mapConfig(result.rows[0]);
}

async function createAssignmentConfig(tenantId, employeeIds) {
  const result = await pool.query(
    `INSERT INTO assignment_config (tenant_id, round_robin_order, today_key, today_stats)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [tenantId, JSON.stringify(employeeIds), new Date().toISOString().slice(0, 10), JSON.stringify({ total: 0, byEmployee: {} })],
  );
  return mapConfig(result.rows[0]);
}

async function saveAssignmentConfig(config) {
  const result = await pool.query(
    `UPDATE assignment_config SET
      mode = $2, auto_assign = $3, round_robin_order = $4, rr_index = $5,
      paused_employees = $6, workload_rules = $7, today_key = $8, today_stats = $9, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [
      config.id,
      config.mode,
      config.autoAssign,
      JSON.stringify(config.roundRobinOrder || []),
      config.rrIndex ?? 0,
      JSON.stringify(config.pausedEmployees || []),
      JSON.stringify(config.workloadRules || {}),
      config.todayKey,
      JSON.stringify(config.todayStats || { total: 0, byEmployee: {} }),
    ],
  );
  return mapConfig(result.rows[0]);
}

async function upsertAssignmentConfig(tenantId, body) {
  const existing = await getAssignmentConfig(tenantId);
  if (!existing) {
    const result = await pool.query(
      `INSERT INTO assignment_config (tenant_id, mode, auto_assign, round_robin_order, rr_index, paused_employees, workload_rules)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        tenantId,
        body.mode || "round_robin",
        body.autoAssign !== false,
        JSON.stringify(body.roundRobinOrder || []),
        body.rrIndex ?? 0,
        JSON.stringify(body.pausedEmployees || []),
        JSON.stringify(body.workloadRules || {}),
      ],
    );
    return mapConfig(result.rows[0]);
  }

  const patch = { ...existing, ...body };
  return saveAssignmentConfig(patch);
}

async function listActiveEmployees(tenantId) {
  const result = await pool.query(
    `SELECT * FROM employees WHERE tenant_id = $1 AND status = 'active' ORDER BY created_at ASC`,
    [tenantId],
  );
  return result.rows.map(mapEmployee);
}

async function listEmployees(tenantId, filters = {}) {
  const conditions = ["tenant_id = $1"];
  const params = [tenantId];
  let idx = 2;
  if (filters.status) {
    conditions.push(`status = $${idx}`);
    params.push(filters.status);
    idx += 1;
  }
  if (filters.q) {
    conditions.push(`(name ILIKE $${idx} OR email ILIKE $${idx} OR role ILIKE $${idx})`);
    params.push(`%${filters.q}%`);
    idx += 1;
  }
  const result = await pool.query(
    `SELECT * FROM employees WHERE ${conditions.join(" AND ")} ORDER BY name ASC`,
    params,
  );
  return result.rows.map(mapEmployee);
}

async function findEmployeeById(tenantId, employeeId) {
  const result = await pool.query(
    `SELECT * FROM employees WHERE id = $1 AND tenant_id = $2`,
    [employeeId, tenantId],
  );
  return mapEmployee(result.rows[0]);
}

async function createEmployee(tenantId, data) {
  const result = await pool.query(
    `INSERT INTO employees (tenant_id, name, email, phone, role, department, status, city, avatar_url, initials, salary, joining_date, manager_id, territory)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [
      tenantId,
      data.name,
      data.email || null,
      data.phone || null,
      data.role || null,
      data.department || null,
      data.status || "active",
      data.city || null,
      data.avatarUrl || null,
      data.initials || null,
      data.salary ?? null,
      data.joiningDate || null,
      data.managerId || null,
      data.territory || null,
    ],
  );
  return mapEmployee(result.rows[0]);
}

async function updateEmployee(tenantId, employeeId, data) {
  const fields = [];
  const params = [employeeId, tenantId];
  let idx = 3;
  const map = {
    name: "name", email: "email", phone: "phone", role: "role", department: "department",
    status: "status", city: "city", avatarUrl: "avatar_url", initials: "initials",
    salary: "salary", joiningDate: "joining_date", managerId: "manager_id", territory: "territory",
    receivingPaused: "receiving_paused",
    maxActiveLeads: "max_active_leads", currentActiveLeads: "current_active_leads", dailyLimit: "daily_limit",
  };
  for (const [key, col] of Object.entries(map)) {
    if (data[key] !== undefined) {
      fields.push(`${col} = $${idx}`);
      params.push(data[key]);
      idx += 1;
    }
  }
  if (data.capacity) {
    if (data.capacity.receivingPaused !== undefined) {
      fields.push(`receiving_paused = $${idx}`);
      params.push(data.capacity.receivingPaused);
      idx += 1;
    }
    if (data.capacity.maxActiveLeads !== undefined) {
      fields.push(`max_active_leads = $${idx}`);
      params.push(data.capacity.maxActiveLeads);
      idx += 1;
    }
    if (data.capacity.currentActiveLeads !== undefined) {
      fields.push(`current_active_leads = $${idx}`);
      params.push(data.capacity.currentActiveLeads);
      idx += 1;
    }
    if (data.capacity.dailyLimit !== undefined) {
      fields.push(`daily_limit = $${idx}`);
      params.push(data.capacity.dailyLimit);
      idx += 1;
    }
  }
  if (!fields.length) return findEmployeeById(tenantId, employeeId);
  fields.push("updated_at = NOW()");
  const result = await pool.query(
    `UPDATE employees SET ${fields.join(", ")} WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    params,
  );
  return mapEmployee(result.rows[0]);
}

async function incrementEmployeeLeads(employeeId, delta) {
  await pool.query(
    `UPDATE employees SET current_active_leads = GREATEST(0, COALESCE(current_active_leads, 0) + $2), updated_at = NOW() WHERE id = $1`,
    [employeeId, delta],
  );
}

async function insertAssignmentHistory(data) {
  const result = await pool.query(
    `INSERT INTO assignment_history (tenant_id, lead_id, from_employee_id, to_employee_id, method, performed_by, reason, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      data.tenantId,
      data.leadId,
      data.fromEmployeeId || null,
      data.toEmployeeId || null,
      data.method,
      data.performedBy || null,
      data.reason || null,
      JSON.stringify(data.metadata || {}),
    ],
  );
  return mapHistory(result.rows[0]);
}

async function listAssignmentHistory(tenantId, limit) {
  const result = await pool.query(
    `SELECT h.*,
      l.lead_name, l.company_name,
      fe.name AS from_name, te.name AS to_name
     FROM assignment_history h
     LEFT JOIN leads l ON l.id = h.lead_id
     LEFT JOIN employees fe ON fe.id = h.from_employee_id
     LEFT JOIN employees te ON te.id = h.to_employee_id
     WHERE h.tenant_id = $1
     ORDER BY h.created_at DESC
     LIMIT $2`,
    [tenantId, limit],
  );
  return result.rows.map((row) => {
    const item = mapHistory(row);
    item.leadId = mapLead({ id: row.lead_id, lead_name: row.lead_name, company_name: row.company_name, tenant_id: tenantId });
    if (row.from_employee_id) item.fromEmployeeId = { id: row.from_employee_id, name: row.from_name };
    if (row.to_employee_id) item.toEmployeeId = { id: row.to_employee_id, name: row.to_name };
    return item;
  });
}

async function insertTimeline(data) {
  const result = await pool.query(
    `INSERT INTO lead_timeline_events (tenant_id, lead_id, type, actor_id, actor_name, actor_role, summary, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      data.tenantId,
      data.leadId,
      data.type,
      data.actorId || null,
      data.actorName || null,
      data.actorRole || null,
      data.summary || null,
      JSON.stringify(data.payload || {}),
    ],
  );
  return mapTimeline(result.rows[0]);
}

async function listTimeline(tenantId, { leadId, limit = 100 } = {}) {
  const params = [tenantId];
  let sql = `SELECT * FROM lead_timeline_events WHERE tenant_id = $1`;
  if (leadId) {
    params.push(leadId);
    sql += ` AND lead_id = $2`;
  }
  params.push(limit);
  sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;
  const result = await pool.query(sql, params);
  return result.rows.map(mapTimeline);
}

async function insertAudit(data) {
  const result = await pool.query(
    `INSERT INTO audit_logs (tenant_id, actor_id, action, resource, resource_id, before_state, after_state, ip, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      data.tenantId,
      data.actorId || null,
      data.action,
      data.resource,
      String(data.resourceId || ""),
      data.before ? JSON.stringify(data.before) : null,
      data.after ? JSON.stringify(data.after) : null,
      data.ip || null,
      JSON.stringify(data.metadata || {}),
    ],
  );
  return mapAudit(result.rows[0]);
}

async function listAudit(tenantId, limit) {
  const result = await pool.query(
    `SELECT * FROM audit_logs WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [tenantId, limit],
  );
  return result.rows.map(mapAudit);
}

async function insertNotification(data) {
  const result = await pool.query(
    `INSERT INTO crm_notifications (tenant_id, user_id, employee_id, type, title, body, entity_type, entity_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      data.tenantId,
      data.userId || null,
      data.employeeId || null,
      data.type,
      data.title,
      data.body || null,
      data.entityType || null,
      String(data.entityId || ""),
    ],
  );
  return mapNotification(result.rows[0]);
}

async function listNotifications(tenantId, filters = {}, limit = 50) {
  const conditions = ["tenant_id = $1"];
  const params = [tenantId];
  let idx = 2;
  if (filters.employeeId) {
    conditions.push(`employee_id = $${idx}`);
    params.push(filters.employeeId);
    idx += 1;
  }
  if (filters.unread) {
    conditions.push("is_read = false");
  }
  params.push(limit);
  const result = await pool.query(
    `SELECT * FROM crm_notifications WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${idx}`,
    params,
  );
  return result.rows.map(mapNotification);
}

async function markNotificationsRead(tenantId, { ids, employeeId } = {}) {
  const conditions = ["tenant_id = $1"];
  const params = [tenantId];
  let idx = 2;
  if (ids?.length) {
    conditions.push(`id = ANY($${idx})`);
    params.push(ids);
    idx += 1;
  }
  if (employeeId) {
    conditions.push(`employee_id = $${idx}`);
    params.push(employeeId);
    idx += 1;
  }
  await pool.query(
    `UPDATE crm_notifications SET is_read = true WHERE ${conditions.join(" AND ")}`,
    params,
  );
}

async function notificationExists(tenantId, type, entityId) {
  const result = await pool.query(
    `SELECT 1 FROM crm_notifications WHERE tenant_id = $1 AND type = $2 AND entity_id = $3 LIMIT 1`,
    [tenantId, type, String(entityId)],
  );
  return result.rowCount > 0;
}

async function insertNote(data) {
  const result = await pool.query(
    `INSERT INTO lead_notes (tenant_id, lead_id, author_id, author_type, body)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [data.tenantId, data.leadId, data.authorId || null, data.authorType || "employee", data.body],
  );
  return mapNote(result.rows[0]);
}

async function listNotes(tenantId, leadId) {
  const result = await pool.query(
    `SELECT * FROM lead_notes WHERE tenant_id = $1 AND lead_id = $2 ORDER BY created_at DESC`,
    [tenantId, leadId],
  );
  return result.rows.map(mapNote);
}

async function insertCall(data) {
  const result = await pool.query(
    `INSERT INTO employee_calls (tenant_id, lead_id, employee_id, direction, outcome, duration_sec, started_at, ended_at, sop_id, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [
      data.tenantId,
      data.leadId,
      data.employeeId,
      data.direction || "outbound",
      data.outcome || null,
      data.durationSec || null,
      data.startedAt || null,
      data.endedAt || null,
      data.sopId || null,
      data.notes || null,
    ],
  );
  return mapCall(result.rows[0]);
}

async function listCalls(tenantId, employeeId) {
  const result = await pool.query(
    `SELECT * FROM employee_calls WHERE tenant_id = $1 AND employee_id = $2 ORDER BY created_at DESC`,
    [tenantId, employeeId],
  );
  return result.rows.map(mapCall);
}

async function insertTask(data) {
  const result = await pool.query(
    `INSERT INTO tasks (tenant_id, assignee_id, lead_id, title, description, priority, due_at, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      data.tenantId,
      data.assigneeId,
      data.leadId || null,
      data.title,
      data.description || null,
      data.priority || "medium",
      data.dueAt || null,
      data.status || "pending",
    ],
  );
  return mapTask(result.rows[0]);
}

async function updateTask(tenantId, taskId, patch) {
  const fields = [];
  const params = [taskId, tenantId];
  let idx = 3;
  for (const [key, col] of Object.entries({
    status: "status", completedAt: "completed_at", title: "title", description: "description",
    priority: "priority", dueAt: "due_at", followUpId: "follow_up_id",
  })) {
    if (patch[key] !== undefined) {
      fields.push(`${col} = $${idx}`);
      params.push(patch[key]);
      idx += 1;
    }
  }
  if (!fields.length) return null;
  fields.push("updated_at = NOW()");
  const result = await pool.query(
    `UPDATE tasks SET ${fields.join(", ")} WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    params,
  );
  return mapTask(result.rows[0]);
}

async function listTasks(tenantId, filters = {}) {
  const conditions = ["tenant_id = $1", "status <> 'cancelled'"];
  const params = [tenantId];
  let idx = 2;
  if (filters.assigneeId) {
    conditions.push(`assignee_id = $${idx}`);
    params.push(filters.assigneeId);
    idx += 1;
  }
  if (filters.status) {
    conditions.push(`status = $${idx}`);
    params.push(filters.status);
    idx += 1;
  }
  if (filters.leadId) {
    conditions.push(`lead_id = $${idx}`);
    params.push(filters.leadId);
    idx += 1;
  }
  let sql = `SELECT * FROM tasks WHERE ${conditions.join(" AND ")} ORDER BY (due_at IS NULL), due_at ASC`;
  if (filters.limit) {
    params.push(filters.limit);
    sql += ` LIMIT $${idx}`;
  }
  const result = await pool.query(sql, params);
  return result.rows.map(mapTask);
}

async function insertFollowup(data) {
  const result = await pool.query(
    `INSERT INTO followups (tenant_id, lead_id, employee_id, task_id, scheduled_at, note, status)
     VALUES ($1,$2,$3,$4,$5,$6,'pending') RETURNING *`,
    [data.tenantId, data.leadId, data.employeeId, data.taskId || null, data.scheduledAt, data.note || null],
  );
  return mapFollowup(result.rows[0]);
}

async function findFollowupById(tenantId, followupId) {
  const result = await pool.query(`SELECT * FROM followups WHERE id = $1 AND tenant_id = $2`, [followupId, tenantId]);
  return mapFollowup(result.rows[0]);
}

async function updateFollowup(tenantId, followupId, patch) {
  const fields = [];
  const params = [followupId, tenantId];
  let idx = 3;
  for (const [key, col] of Object.entries({ status: "status", completedAt: "completed_at", taskId: "task_id" })) {
    if (patch[key] !== undefined) {
      fields.push(`${col} = $${idx}`);
      params.push(patch[key]);
      idx += 1;
    }
  }
  if (!fields.length) return findFollowupById(tenantId, followupId);
  const result = await pool.query(
    `UPDATE followups SET ${fields.join(", ")} WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    params,
  );
  return mapFollowup(result.rows[0]);
}

async function listFollowups(tenantId, employeeId) {
  const result = await pool.query(
    `SELECT * FROM followups WHERE tenant_id = $1 AND employee_id = $2 ORDER BY scheduled_at ASC`,
    [tenantId, employeeId],
  );
  return result.rows.map(mapFollowup);
}

async function listDueFollowups(tenantId, limit) {
  const result = await pool.query(
    `SELECT * FROM followups WHERE tenant_id = $1 AND status = 'pending' AND scheduled_at <= NOW() LIMIT $2`,
    [tenantId, limit],
  );
  return result.rows.map(mapFollowup);
}

async function insertMeeting(data) {
  const result = await pool.query(
    `INSERT INTO meetings (tenant_id, lead_id, employee_id, title, scheduled_at, duration_min, meet_link, location, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'scheduled') RETURNING *`,
    [
      data.tenantId,
      data.leadId,
      data.employeeId,
      data.title || null,
      data.scheduledAt,
      data.durationMin || null,
      data.meetLink || null,
      data.location || null,
    ],
  );
  return mapMeeting(result.rows[0]);
}

async function updateMeeting(tenantId, meetingId, patch) {
  const fields = [];
  const params = [meetingId, tenantId];
  let idx = 3;
  for (const [key, col] of Object.entries({ status: "status", mom: "mom" })) {
    if (patch[key] !== undefined) {
      fields.push(`${col} = $${idx}`);
      params.push(key === "mom" ? JSON.stringify(patch[key]) : patch[key]);
      idx += 1;
    }
  }
  if (!fields.length) return null;
  const result = await pool.query(
    `UPDATE meetings SET ${fields.join(", ")} WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    params,
  );
  return mapMeeting(result.rows[0]);
}

async function listMeetings(tenantId, employeeId) {
  const result = await pool.query(
    `SELECT * FROM meetings WHERE tenant_id = $1 AND employee_id = $2 ORDER BY scheduled_at ASC`,
    [tenantId, employeeId],
  );
  return result.rows.map(mapMeeting);
}

async function insertFileAsset(data) {
  const result = await pool.query(
    `INSERT INTO file_assets (tenant_id, uploaded_by, entity_type, entity_id, filename, original_name, mime, size, storage_key, url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [
      data.tenantId,
      data.uploadedBy || null,
      data.entityType || null,
      data.entityId || null,
      data.filename,
      data.originalName,
      data.mime,
      data.size,
      data.storageKey,
      data.url,
    ],
  );
  return mapFileAsset(result.rows[0]);
}

async function getAdminKpis(tenantId, range = {}) {
  const params = [tenantId];
  let dateFilter = "";
  if (range.start) {
    params.push(range.start);
    dateFilter += ` AND created_at >= $${params.length}`;
  }
  if (range.end) {
    params.push(range.end);
    dateFilter += ` AND created_at <= $${params.length}`;
  }

  const result = await pool.query(
    `SELECT
      COUNT(*)::int AS total_leads,
      COALESCE(SUM(expected_revenue), 0)::float AS pipeline_value,
      COUNT(*) FILTER (WHERE pipeline_stage IN ('qualified','meeting','proposal','negotiation','won'))::int AS qualified,
      COUNT(*) FILTER (WHERE pipeline_stage = 'won')::int AS conversions,
      COALESCE(SUM(expected_revenue) FILTER (WHERE pipeline_stage = 'won'), 0)::float AS revenue
     FROM leads
     WHERE tenant_id = $1 AND is_deleted = false ${dateFilter}`,
    params,
  );

  const row = result.rows[0];
  return {
    revenue: row.revenue || 0,
    cashCollected: row.revenue || 0,
    conversionRate: row.total_leads ? Math.round(((row.conversions || 0) / row.total_leads) * 100) : 0,
    qualifiedLeads: row.qualified || 0,
    pipelineValue: row.pipeline_value || 0,
    totalLeads: row.total_leads || 0,
  };
}

async function getPipelineGrouped(tenantId, filters = {}) {
  const params = [tenantId];
  let sql = `
    SELECT pipeline_stage AS stage, COUNT(*)::int AS count, COALESCE(SUM(expected_revenue), 0)::float AS value
    FROM leads WHERE tenant_id = $1 AND is_deleted = false
  `;
  let idx = 2;
  if (filters.assignedTo) {
    sql += ` AND assigned_to = $${idx}`;
    params.push(filters.assignedTo);
    idx += 1;
  }
  if (filters.temperature) {
    sql += ` AND temperature = $${idx}`;
    params.push(filters.temperature);
    idx += 1;
  }
  sql += ` GROUP BY pipeline_stage ORDER BY pipeline_stage`;
  const result = await pool.query(sql, params);
  return result.rows.map((r) => ({ _id: r.stage, count: r.count, value: r.value }));
}

async function getLeaderboard(tenantId, limit = 10) {
  const result = await pool.query(
    `SELECT l.assigned_to AS employee_id,
      COUNT(*)::int AS conversions,
      COALESCE(SUM(l.expected_revenue), 0)::float AS revenue,
      e.name, e.email, e.role, e.department
     FROM leads l
     JOIN employees e ON e.id = l.assigned_to
     WHERE l.tenant_id = $1 AND l.pipeline_stage = 'won' AND l.is_deleted = false
     GROUP BY l.assigned_to, e.name, e.email, e.role, e.department
     ORDER BY conversions DESC, revenue DESC
     LIMIT $2`,
    [tenantId, limit],
  );
  return result.rows.map((r) => ({
    _id: r.employee_id,
    conversions: r.conversions,
    revenue: r.revenue,
    employee: mapEmployee({
      id: r.employee_id,
      name: r.name,
      email: r.email,
      role: r.role,
      department: r.department,
      tenant_id: tenantId,
      status: "active",
    }),
  }));
}

async function ping() {
  await pool.query("SELECT 1");
  return true;
}

module.exports = {
  DEFAULT_TENANT_ID,
  ping,
  insertLead,
  findLeadById,
  listLeads,
  updateLead,
  softDeleteLead,
  touchLeadActivity,
  insertQueueItem,
  listQueue,
  getQueuedItems,
  updateQueueItem,
  markQueueAssigned,
  getAssignmentConfig,
  createAssignmentConfig,
  saveAssignmentConfig,
  upsertAssignmentConfig,
  listActiveEmployees,
  listEmployees,
  findEmployeeById,
  createEmployee,
  updateEmployee,
  incrementEmployeeLeads,
  insertAssignmentHistory,
  listAssignmentHistory,
  insertTimeline,
  listTimeline,
  insertAudit,
  listAudit,
  insertNotification,
  listNotifications,
  markNotificationsRead,
  notificationExists,
  insertNote,
  listNotes,
  insertCall,
  listCalls,
  insertTask,
  updateTask,
  listTasks,
  insertFollowup,
  findFollowupById,
  updateFollowup,
  listFollowups,
  listDueFollowups,
  insertMeeting,
  updateMeeting,
  listMeetings,
  insertFileAsset,
  getAdminKpis,
  getPipelineGrouped,
  getLeaderboard,
};
