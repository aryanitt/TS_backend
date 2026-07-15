const pool = require("../../config/db");
const mock = require("../data/mockFallback");
const { PIPELINE_QUALIFIED_LEAD_SQL } = require("../utils/leadStats");

const TENANT = "default";

const CONVERTED_LEAD_SQL = `
  LOWER(COALESCE(pipeline_stage, '')) IN ('converted', 'won', 'closed won')
  OR LOWER(COALESCE(status, '')) IN ('converted', 'won')
`;

const CONVERTED_LEAD_SQL_ALIASED = `
  LOWER(COALESCE(l.pipeline_stage, '')) IN ('converted', 'won', 'closed won')
  OR LOWER(COALESCE(l.status, '')) IN ('converted', 'won')
`;

function formatINR(amount) {
  const n = Number(amount) || 0;
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
}

function rangeToDates(rangeKey) {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  let start = new Date(now);
  if (rangeKey === "today") {
    start.setHours(0, 0, 0, 0);
  } else if (rangeKey === "week") {
    start.setDate(start.getDate() - start.getDay());
    start.setHours(0, 0, 0, 0);
  } else if (rangeKey === "month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    start.setHours(0, 0, 0, 0);
  } else {
    start = null;
  }
  return { start, end };
}

const STAGE_TO_PIPELINE = {
  "new lead": "new",
  new: "new",
  attempted: "contacted",
  conversation: "contacted",
  "call booked": "contacted",
  contacted: "contacted",
  booked: "qualified",
  "showed up": "qualified",
  "showed-up": "qualified",
  qualified: "qualified",
  "proposal sent": "proposal",
  proposal: "proposal",
  negotiation: "negotiation",
  converted: "closed_won",
  "closed won": "closed_won",
  won: "closed_won",
};

function mapStageToPipeline(stage) {
  const key = String(stage || "new").toLowerCase().trim();
  if (STAGE_TO_PIPELINE[key]) return STAGE_TO_PIPELINE[key];
  const STAGE_MAP = [
    ["closed won", "closed_won"],
    ["converted", "closed_won"],
    ["won", "closed_won"],
    ["proposal sent", "proposal"],
    ["showed up", "qualified"],
    ["showed-up", "qualified"],
    ["booked", "qualified"],
    ["conversation", "contacted"],
    ["not interested", "not_interested"],
    ["negotiation", "negotiation"],
    ["proposal", "proposal"],
    ["qualified", "qualified"],
    ["contacted", "contacted"],
    ["attempted", "contacted"],
    ["new", "new"],
  ];
  for (const [needle, id] of STAGE_MAP) {
    if (key.includes(needle)) return id;
  }
  return "new";
}

function tempToPriority(temp) {
  const t = String(temp || "").toLowerCase();
  if (t.includes("hot")) return "HOT";
  if (t.includes("cold")) return "COLD";
  return "WARM";
}

function normalizeLeadText(value) {
  return String(value || "").toLowerCase().trim();
}

function mapLeadToPipelineColumn(row) {
  const stageRaw = String(row.pipeline_stage || row.status || "new").toLowerCase().trim();

  let stage = "new";
  const STAGE_MAP = [
    ["closed won", "closed_won"],
    ["converted", "closed_won"],
    ["won", "closed_won"],
    ["proposal sent", "proposal"],
    ["showed up", "qualified"],
    ["showed-up", "qualified"],
    ["booked", "qualified"],
    ["conversation", "contacted"],
    ["not interested", "not_interested"],
    ["not_interested", "not_interested"],
    ["ni", "not_interested"],
    ["negotiation", "negotiation"],
    ["proposal", "proposal"],
    ["qualified", "qualified"],
    ["contacted", "contacted"],
    ["attempted", "contacted"],
    ["new", "new"],
  ];
  for (const [needle, id] of STAGE_MAP) {
    if (stageRaw.includes(needle)) {
      stage = id;
      break;
    }
  }

  if (stage === "new" || stage === "not_interested") {
    return null;
  }
  if (stage === "closed_won") return "Conversion";
  if (stage === "negotiation") return "Negotiation";
  if (stage === "proposal") return "Meeting";
  if (stage === "qualified") return "Qualified";
  if (stage === "contacted") return "Contacted";

  return null;
}

function mapLeadToTemperature(row) {
  const priority = tempToPriority(row.temperature || row.priority);
  if (priority === "HOT") return "Hot";
  if (priority === "COLD") return "Cold";
  return "Warm";
}

function buildPipelineStatusGrid(rows) {
  const stages = ["Contacted", "Qualified", "Meeting", "Negotiation", "Conversion"];
  const temps = ["Hot", "Warm", "Cold"];
  const grid = {};
  temps.forEach((t) => {
    grid[t] = {};
    stages.forEach((s) => {
      grid[t][s] = 0;
    });
  });

  rows.forEach((row) => {
    const col = mapLeadToPipelineColumn(row);
    if (!col) return;
    const temp = mapLeadToTemperature(row);
    grid[temp][col] += 1;
  });

  const stageTotals = {};
  stages.forEach((s) => {
    stageTotals[s] = temps.reduce((acc, t) => acc + grid[t][s], 0);
  });

  const tempTotals = {};
  temps.forEach((t) => {
    tempTotals[t] = stages.reduce((acc, s) => acc + grid[t][s], 0);
  });

  const totalLeads = Object.values(tempTotals).reduce((a, b) => a + b, 0);
  const conversions = stageTotals.Conversion || 0;
  const overallConv = totalLeads > 0 ? Math.round((conversions / totalLeads) * 100) : 0;

  return {
    grid,
    stages,
    stageTotals,
    tempTotals,
    totalLeads,
    conversions,
    overallConv,
  };
}

async function queryPipelineLeadRows(tenantId, rangeKey = "week", service = "All Services", employee = "All Employees") {
  const params = [tenantId];
  let where = "l.tenant_id = $1 AND l.is_deleted = 0";

  if (service && service !== "All Services") {
    params.push(`%${service}%`);
    const idx = params.length;
    where += ` AND (l.form_name LIKE $${idx} OR l.keyword LIKE $${idx} OR l.source LIKE $${idx})`;
  }

  if (employee && employee !== "All Employees") {
    params.push(employee);
    const idx = params.length;
    where += ` AND l.assigned_to = (SELECT id FROM employees WHERE name = $${idx} LIMIT 1)`;
  }

  const result = await pool.query(
    `SELECT l.pipeline_stage, l.status, l.temperature, l.priority, l.form_name
     FROM leads l
     WHERE ${where}`,
    params,
  );

  if (result.rows.length) return result.rows;

  let legacyWhere = "1=1";
  const legacyParams = [];
  if (employee && employee !== "All Employees") {
    legacyParams.push(employee);
    legacyWhere += ` AND employee_name = $1`;
  }
  const legacy = await pool.query(
    `SELECT pipeline_stage, status, temperature, NULL AS priority, form_name
     FROM emp_leads
     WHERE ${legacyWhere}`,
    legacyParams,
  );
  return legacy.rows;
}

async function getPipelineStatusGrid(tenantId = TENANT, options = {}) {
  const { rangeKey = "week", service = "All Services", employee = "All Employees" } = options;
  const emptyGrid = buildPipelineStatusGrid([]);

  if (!(await dbReady())) {
    const empLower = String(employee || "").toLowerCase();
    if (empLower.includes("aryan")) {
      return { success: true, source: "mock", ...emptyGrid };
    }
    if (empLower.includes("ritik")) {
      const ritikGrid = buildPipelineStatusGrid([
        { pipeline_stage: "New", status: "New", temperature: "Warm Lead", form_name: "AI Automation Suite" }
      ]);
      return { success: true, source: "mock", ...ritikGrid };
    }
    const allMockLeads = [
      { pipeline_stage: "New", status: "New", temperature: "Hot Lead" },
      { pipeline_stage: "New", status: "New", temperature: "Warm Lead" },
      { pipeline_stage: "New", status: "New", temperature: "Warm Lead" },
      { pipeline_stage: "New", status: "New", temperature: "Cold Lead" },
      { pipeline_stage: "New", status: "New", temperature: "Cold Lead" },
      { pipeline_stage: "New", status: "New", temperature: "Cold Lead" },
      { pipeline_stage: "New", status: "New", temperature: "Cold Lead" },
      { pipeline_stage: "Contacted", status: "Contacted", temperature: "Warm Lead" },
      { pipeline_stage: "Contacted", status: "Contacted", temperature: "Cold Lead" },
      { pipeline_stage: "Qualified", status: "Qualified", temperature: "Warm Lead" },
      { pipeline_stage: "Qualified", status: "Qualified", temperature: "Cold Lead" },
      { pipeline_stage: "Negotiation", status: "Negotiation", temperature: "Warm Lead" },
      { pipeline_stage: "Converted", status: "Converted", temperature: "Warm Lead" },
      { pipeline_stage: "Converted", status: "Converted", temperature: "Warm Lead" }
    ];
    const allGrid = buildPipelineStatusGrid(allMockLeads);
    return { success: true, source: "mock", ...allGrid };
  }

  try {
    const rows = await queryPipelineLeadRows(tenantId, rangeKey, service, employee);
    const built = buildPipelineStatusGrid(rows);
    return {
      success: true,
      source: rows.length ? "database" : "empty",
      ...built,
    };
  } catch (err) {
    console.error("getPipelineStatusGrid error:", err.message);
    return { success: true, source: "mock", ...emptyGrid };
  }
}

async function dbReady() {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

async function queryLeadsStats(tenantId) {
  const [result, cashResult, callsResult] = await Promise.all([
    pool.query(
      `SELECT
        COUNT(*) AS total_leads,
        COALESCE(SUM(expected_revenue), 0) AS pipeline_value,
        SUM(CASE WHEN ${PIPELINE_QUALIFIED_LEAD_SQL.replace(/\bl\./g, "")} THEN 1 ELSE 0 END) AS qualified,
        SUM(CASE WHEN ${CONVERTED_LEAD_SQL} THEN 1 ELSE 0 END) AS conversions,
        COALESCE(SUM(CASE WHEN ${CONVERTED_LEAD_SQL} THEN expected_revenue ELSE 0 END), 0) AS revenue
       FROM leads
       WHERE tenant_id = $1 AND is_deleted = 0`,
      [tenantId],
    ),
    pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS cash_collected
       FROM cash_collections
       WHERE tenant_id = $1`,
      [tenantId],
    ),
    pool.query(
      `SELECT COUNT(*) AS total_calls
       FROM employee_calls
       WHERE tenant_id = $1`,
      [tenantId],
    )
  ]);

  const row = result.rows[0] || {};
  row.cash_collected = cashResult.rows[0]?.cash_collected || 0;
  row.total_calls = callsResult.rows[0]?.total_calls || 0;
  return row;
}

async function queryLeaderboard(tenantId, rangeKey, limit = 3) {
  const result = await pool.query(
    `SELECT e.name, e.id,
      COUNT(l.id) AS leads,
      SUM(CASE WHEN ${CONVERTED_LEAD_SQL_ALIASED} THEN 1 ELSE 0 END) AS conv,
      COALESCE(SUM(CASE WHEN ${CONVERTED_LEAD_SQL_ALIASED} THEN l.expected_revenue ELSE 0 END), 0) AS rev
     FROM employees e
     LEFT JOIN leads l ON l.assigned_to = e.id AND l.is_deleted = 0 AND l.tenant_id = $1
     WHERE e.tenant_id = $1 AND (LOWER(COALESCE(e.status, 'active')) = 'active')
     GROUP BY e.id, e.name
     ORDER BY conv DESC, leads DESC, e.name ASC`,
    [tenantId],
  );

  let rows = result.rows.slice(0, limit);
  if (!rows.length) {
    const emps = await pool.query(
      `SELECT name, id FROM employees WHERE tenant_id = $1 ORDER BY name ASC LIMIT $2`,
      [tenantId, limit],
    );
    rows = emps.rows.map((r) => ({ ...r, leads: 0, conv: 0, rev: 0 }));
  }

  return rows.map((r) => {
    const leads = Number(r.leads) || 0;
    const conv = Number(r.conv) || 0;
    return {
      name: r.name,
      leads,
      resp: "2h",
      qualR: leads ? `${Math.min(99, Math.round(((leads - conv) / leads) * 100))}%` : "0%",
      convR: leads ? `${Math.round((conv / leads) * 100)}%` : "0%",
      conv,
      rev: formatINR(r.rev),
    };
  });
}

async function buildFilterDataFromDb(tenantId) {
  const [stats, leaderboard] = await Promise.all([
    queryLeadsStats(tenantId),
    queryLeaderboard(tenantId, "all"),
  ]);

  const total = Number(stats.total_leads) || 0;
  const qualified = Number(stats.qualified) || 0;
  const conversions = Number(stats.conversions) || 0;
  const revenue = Number(stats.revenue) || 0;
  const pipeline = Number(stats.pipeline_value) || 0;
  const cashCollected = Number(stats.cash_collected) || 0;
  const convRate = total ? Math.round((conversions / total) * 100) : 0;

  const rangeData = {
    kpis: [
      { label: "Total Revenue", value: formatINR(revenue), icon: "DollarSign" },
      { label: "Cash Collected", value: formatINR(cashCollected), icon: "DollarSign" },
      { label: "Total Leads", value: String(total), icon: "Users" },
      { label: "Total Calls Made", value: String(stats.total_calls || 0), icon: "Phone" },
      { label: "Qualified Leads", value: String(qualified), icon: "FileText" },
      { label: "Pipeline Value", value: formatINR(pipeline), icon: "DollarSign" },
      { label: "Closings", value: String(conversions), icon: "Trophy" },
    ],
    leaderboard: leaderboard,
    metrics: {
      pickup: Math.min(95, 60 + Math.round(total / 10)),
      qualification: total ? Math.round((qualified / total) * 100) : 0,
      conversion: convRate,
    },
    insights: [],
    activity: [],
  };

  return {
    today: rangeData,
    week: rangeData,
    month: rangeData,
  };
}

async function getAiInsightsFromDb(tenantId, context = "dashboard") {
  const result = await pool.query(
    `SELECT type, title, body, tone FROM ai_insights
     WHERE tenant_id = $1 AND (context = $2 OR context = 'all')
     ORDER BY created_at DESC LIMIT 10`,
    [tenantId, context],
  );
  return result.rows;
}

async function getActivityFromDb(limit = 10) {
  const result = await pool.query(
    `SELECT action, entity, user_name, created_at FROM activity_logs ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return result.rows.map((r) => ({
    type: "check",
    text: r.action || `${r.entity} updated`,
  }));
}

function emptyFilterRange() {
  return {
    kpis: [
      { label: "Total Revenue", value: "₹0", icon: "DollarSign" },
      { label: "Cash Collected", value: "₹0", icon: "DollarSign" },
      { label: "Total Leads", value: "0", icon: "Users" },
      { label: "Total Calls Made", value: "0", icon: "Phone" },
      { label: "Qualified Leads", value: "0", icon: "FileText" },
      { label: "Pipeline Value", value: "₹0", icon: "DollarSign" },
      { label: "Closings", value: "0", icon: "Trophy" },
    ],
    leaderboard: [],
    metrics: { pickup: 0, qualification: 0, conversion: 0 },
    insights: [],
    activity: [],
  };
}

function emptyFilterData() {
  return {
    today: emptyFilterRange(),
    week: emptyFilterRange(),
    month: emptyFilterRange(),
  };
}

async function getDashboardBundle(tenantId = TENANT) {
  const empty = emptyFilterData();

  if (!(await dbReady())) {
    return {
      source: "empty",
      filterData: empty,
      revenueSeries: [],
      aiInsights: [],
      success: true,
    };
  }

  try {
    const [filterData, dbInsights, activity, revenueResult] = await Promise.all([
      buildFilterDataFromDb(tenantId),
      getAiInsightsFromDb(tenantId, "dashboard"),
      getActivityFromDb(8),
      pool.query(
        `SELECT DATE_FORMAT(created_at, '%b') AS month,
          COALESCE(SUM(CASE WHEN pipeline_stage = 'Converted' OR status = 'Converted' THEN expected_revenue ELSE 0 END), 0) AS revenue
         FROM leads WHERE tenant_id = $1 AND is_deleted = 0 AND created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
         GROUP BY DATE_FORMAT(created_at, '%Y-%m'), DATE_FORMAT(created_at, '%b')
         ORDER BY DATE_FORMAT(created_at, '%Y-%m')`,
        [tenantId],
      )
    ]);

    const aiInsights = dbInsights.length
      ? dbInsights.map((row) => ({
          type: row.tone || row.type || "check",
          title: row.title || "Insight",
          body: row.body || "",
          tone: row.tone || row.type || "check",
        }))
      : [];

    if (activity.length) {
      for (const key of ["today", "week", "month"]) {
        if (filterData[key]) filterData[key].activity = activity;
      }
    }

    const revenueSeries = revenueResult.rows.map((r) => ({
      month: r.month,
      revenue: Math.round(Number(r.revenue) / 10000) || 0,
      forecast: Math.round((Number(r.revenue) / 10000) * 0.9) || 0,
    }));

    return { source: "database", filterData, revenueSeries, aiInsights, success: true };
  } catch (err) {
    console.error("getDashboardBundle error:", err.message);
    return { source: "error", filterData: empty, revenueSeries: [], aiInsights: mock.aiInsights, success: true };
  }
}

function mapPipelineTaskRow(row) {
  return {
    id: row.id,
    text: row.title,
    done: row.status === "done" || row.status === "completed",
  };
}

async function loadTasksByLeadIds(tenantId, leadIds) {
  const ids = leadIds.map(Number).filter(Boolean);
  if (!ids.length) return {};

  const placeholders = ids.map((_, i) => `$${i + 2}`).join(", ");
  const result = await pool.query(
    `SELECT id, lead_id, title, status FROM tasks
     WHERE tenant_id = $1 AND lead_id IN (${placeholders}) AND status <> 'cancelled'
     ORDER BY created_at ASC`,
    [tenantId, ...ids],
  );

  const grouped = {};
  for (const row of result.rows) {
    const key = String(row.lead_id);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(mapPipelineTaskRow(row));
  }
  return grouped;
}

async function listLeadTasks(leadId, tenantId = TENANT) {
  if (!(await dbReady())) return [];
  const result = await pool.query(
    `SELECT id, lead_id, title, status FROM tasks
     WHERE tenant_id = $1 AND lead_id = $2 AND status <> 'cancelled'
     ORDER BY created_at ASC`,
    [tenantId, leadId],
  );
  return result.rows.map(mapPipelineTaskRow);
}

async function createLeadTask(leadId, { title, assigneeId, tenantId = TENANT }) {
  if (!(await dbReady())) {
    throw new Error("Database not connected");
  }
  if (!assigneeId) {
    throw new Error("Lead must be assigned to an employee before adding tasks");
  }

  const result = await pool.query(
    `INSERT INTO tasks (tenant_id, assignee_id, lead_id, title, priority, status, due_at)
     VALUES ($1, $2, $3, $4, 'medium', 'pending', NOW()) RETURNING id, lead_id, title, status`,
    [tenantId, assigneeId, leadId, title],
  );

  const row = result.rows[0];
  if (row) return mapPipelineTaskRow(row);
  return { id: result.insertId, text: title, done: false };
}

async function updateLeadTask(taskId, patch, tenantId = TENANT) {
  if (!(await dbReady())) {
    throw new Error("Database not connected");
  }

  const fields = [];
  const params = [taskId, tenantId];
  let idx = 3;

  if (patch.status !== undefined) {
    fields.push(`status = $${idx}`);
    params.push(patch.status);
    idx += 1;
  }
  if (patch.status === "done") {
    fields.push("completed_at = NOW()");
  }
  if (patch.status === "pending") {
    fields.push("completed_at = NULL");
  }

  if (!fields.length) return null;

  fields.push("updated_at = NOW()");
  const result = await pool.query(
    `UPDATE tasks SET ${fields.join(", ")} WHERE id = $1 AND tenant_id = $2 RETURNING id, lead_id, title, status`,
    params,
  );

  const row = result.rows[0];
  return row ? mapPipelineTaskRow(row) : null;
}

async function getPipelineLeads(tenantId = TENANT) {
  if (!(await dbReady())) return { source: "mock", leads: [] };

  try {
    const result = await pool.query(
      `SELECT l.*, e.name AS assignee_name, e.initials AS assignee_initials
       FROM leads l
       LEFT JOIN employees e ON e.id = l.assigned_to
       WHERE l.tenant_id = $1 AND l.is_deleted = 0
       ORDER BY l.updated_at DESC`,
      [tenantId],
    );

    if (!result.rows.length) return { source: "mock", leads: [] };

    const tasksByLead = await loadTasksByLeadIds(
      tenantId,
      result.rows.map((row) => row.id),
    );

    const leads = result.rows.map((row) => {
      const assigneeName = row.assignee_name || null;
      return {
      id: String(row.id),
      stage: mapStageToPipeline(row.pipeline_stage || row.status),
      name: row.lead_name,
      company: row.company_name || "—",
      value: Number(row.expected_revenue) || 0,
      priority: tempToPriority(row.temperature),
      updatedAt: row.updated_at || row.created_at,
      city: row.city,
      source: row.source,
      winProbability: row.win_probability || 50,
      phone: row.phone,
      email: row.email,
      owner: assigneeName,
      assignee: assigneeName,
      assignee_name: assigneeName,
      employeeName: assigneeName,
      assigneeId: row.assigned_to || null,
      assignedTo: assigneeName && row.assigned_to
        ? { id: row.assigned_to, name: assigneeName, initials: row.assignee_initials }
        : null,
      nextFollowUp: row.next_follow_up_at
        ? new Date(row.next_follow_up_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
        : "",
      activities: [],
      tasks: tasksByLead[String(row.id)] || [],
      _dbId: row.id,
    };
    });

    return { source: "database", leads, success: true };
  } catch (err) {
    console.error("getPipelineLeads error:", err.message);
    return { source: "mock", leads: [] };
  }
}

async function updatePipelineLeadStage(leadId, stage, tenantId = TENANT) {
  const stageToDb = {
    new: "Conversation",
    contacted: "Conversation",
    qualified: "Booked",
    proposal: "Proposal Sent",
    negotiation: "Proposal Sent",
    closed_won: "Converted",
    not_interested: "Not Interested",
  };
  const dbStage = stageToDb[stage] || stage;

  await pool.query(
    `UPDATE leads SET pipeline_stage = $1, status = $1, updated_at = NOW(), last_activity_at = NOW()
     WHERE id = $2 AND tenant_id = $3`,
    [dbStage, leadId, tenantId],
  );
  return { success: true };
}

async function getReportsBundle(tenantId = TENANT) {
  const empty = {
    kpis: {
      totalRevenue: { value: "₹0", growth: "—", comparison: "vs last month" },
      conversionRate: { value: "0%", growth: "—", comparison: "vs last month" },
      momGrowth: { value: "0%", growth: "—", comparison: "vs last month" },
      forecastQ3: { value: "₹0", growth: "—", comparison: "vs last month" },
    },
    aiSummary: [],
    revenueAnalytics: [],
    leadSources: [],
    conversionByStage: [],
    team: [],
  };

  if (!(await dbReady())) return { source: "empty", ...empty, success: true };

  try {
    const stats = await queryLeadsStats(tenantId, "month");
    const total = Number(stats.total_leads) || 0;
    const conversions = Number(stats.conversions) || 0;
    const revenue = Number(stats.revenue) || 0;

    const sources = await pool.query(
      `SELECT source, COUNT(*) AS leads FROM leads WHERE tenant_id = $1 AND is_deleted = 0 GROUP BY source ORDER BY leads DESC LIMIT 8`,
      [tenantId],
    );

    const stages = await pool.query(
      `SELECT pipeline_stage AS stage, COUNT(*) AS count FROM leads WHERE tenant_id = $1 AND is_deleted = 0 GROUP BY pipeline_stage`,
      [tenantId],
    );

    const team = await pool.query(
      `SELECT e.id, e.name,
        COALESCE(SUM(CASE WHEN l.pipeline_stage = 'Converted' OR l.status = 'Converted' THEN l.expected_revenue ELSE 0 END), 0) AS revenue,
        SUM(CASE WHEN l.pipeline_stage = 'Converted' OR l.status = 'Converted' THEN 1 ELSE 0 END) AS deals
       FROM employees e
       LEFT JOIN leads l ON l.assigned_to = e.id AND l.is_deleted = 0
       WHERE e.tenant_id = $1
       GROUP BY e.id, e.name ORDER BY revenue DESC LIMIT 10`,
      [tenantId],
    );

    const dbInsights = await getAiInsightsFromDb(tenantId, "reports");

    return {
      source: total > 0 ? "database" : "empty",
      success: true,
      kpis: {
        totalRevenue: { value: formatINR(revenue), growth: "—", comparison: "vs last month" },
        conversionRate: { value: `${total ? Math.round((conversions / total) * 100) : 0}%`, growth: "—", comparison: "vs last month" },
        momGrowth: { value: "0%", growth: "—", comparison: "vs last month" },
        forecastQ3: { value: formatINR(revenue * 1.3), growth: "—", comparison: "vs last month" },
      },
      aiSummary: dbInsights.length ? dbInsights.map((i) => i.body || i.title) : [],
      revenueAnalytics: [],
      leadSources: sources.rows.map((r) => ({ source: r.source || "Unknown", leads: Number(r.leads) })),
      conversionByStage: stages.rows.map((r) => ({ stage: r.stage, count: Number(r.count) })),
      team: team.rows.map((r) => ({
        id: r.id,
        name: r.name,
        revenue: formatINR(r.revenue),
        dealsClosed: Number(r.deals) || 0,
        conversionRate: `${total ? Math.round(((Number(r.deals) || 0) / total) * 100) : 0}%`,
      })),
    };
  } catch (err) {
    console.error("getReportsBundle error:", err.message);
    return { source: "empty", ...empty, success: true };
  }
}

async function getSettings(tenantId = TENANT) {
  if (!(await dbReady())) return { source: "mock", settings: mock.DEFAULT_SETTINGS, success: true };

  try {
    const result = await pool.query(
      `SELECT settings_json FROM tenant_settings WHERE tenant_id = $1 LIMIT 1`,
      [tenantId],
    );
    if (result.rows[0]?.settings_json) {
      const settings = typeof result.rows[0].settings_json === "string"
        ? JSON.parse(result.rows[0].settings_json)
        : result.rows[0].settings_json;
      return { source: "database", settings, success: true };
    }
    return { source: "mock", settings: mock.DEFAULT_SETTINGS, success: true };
  } catch {
    return { source: "mock", settings: mock.DEFAULT_SETTINGS, success: true };
  }
}

async function saveSettings(tenantId, payload) {
  const json = JSON.stringify(payload);
  await pool.query(
    `INSERT INTO tenant_settings (tenant_id, settings_json) VALUES ($1, $2)
     ON DUPLICATE KEY UPDATE settings_json = VALUES(settings_json), updated_at = NOW()`,
    [tenantId, json],
  );
  return { success: true, settings: payload };
}

async function listServices(tenantId = TENANT) {
  if (!(await dbReady())) return { source: "empty", services: [], success: true };

  try {
    const result = await pool.query(
      `SELECT * FROM services WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId],
    );
    if (!result.rows.length) return { source: "empty", services: [], success: true };

    const services = result.rows.map((r) => ({
      ...((typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata) || {}),
      id: r.id,
      name: r.name,
      category: r.category,
      categoryLabel: r.category_label,
      status: r.status,
      revenue: Number(r.revenue) || 0,
      leads: Number(r.leads) || 0,
      converted: Number(r.converted) || 0,
      convRate: Number(r.conv_rate) || 0,
      priceNum: Number(r.price_num) || 0,
      price: r.price_label,
      description: r.description,
      icon: r.icon,
    }));
    return { source: "database", services, success: true };
  } catch {
    return { source: "empty", services: [], success: true };
  }
}

async function createService(tenantId, data) {
  const id = data.id || `svc-${Date.now()}`;
  const metadata = JSON.stringify(data);
  await pool.query(
    `INSERT INTO services (id, tenant_id, name, category, category_label, status, description, revenue, leads, converted, conv_rate, price_num, price_label, icon, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      id, tenantId, data.name, data.category || "ai", data.categoryLabel || "",
      data.status || "ACTIVE", data.description || "", data.revenue || 0,
      data.leads || 0, data.converted || 0, data.convRate || 0,
      data.priceNum || 0, data.price || "", data.icon || "bot", metadata,
    ],
  );
  return { success: true, service: { ...data, id } };
}

async function listForms(tenantId = TENANT) {
  if (!(await dbReady())) return { source: "empty", forms: [], success: true };

  try {
    const result = await pool.query(
      `SELECT * FROM forms WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId],
    );
    const forms = result.rows.map((r) => ({
      id: r.id,
      name: r.name,
      source: r.source,
      sourceKey: r.source_key,
      status: r.status,
      leads: Number(r.leads) || 0,
      revenue: Number(r.revenue) || 0,
      conversion: Number(r.conversion) || 0,
      service: r.service,
      fields: typeof r.fields === "string" ? JSON.parse(r.fields) : r.fields || [],
    }));
    return { source: "database", forms, success: true };
  } catch {
    return { source: "empty", forms: [], success: true };
  }
}

const SOURCE_LABELS = {
  google_ads: "Google Ads",
  instagram: "Instagram",
  website: "Website",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
};

function normalizeFormRow(data, id) {
  const sourceKey = data.sourceKey || data.source_key || "website";
  return {
    id,
    name: data.name,
    source: data.source || SOURCE_LABELS[sourceKey] || "Website",
    sourceKey,
    status: data.status || "ACTIVE",
    service: data.service || "",
    fields: Array.isArray(data.fields) ? data.fields : [],
    leads: Number(data.leads) || 0,
    revenue: Number(data.revenue) || 0,
    conversion: Number(data.conversion) || 0,
  };
}

async function createForm(tenantId, data) {
  const id = data.id || `form-${Date.now()}`;
  const form = normalizeFormRow(data, id);
  await pool.query(
    `INSERT INTO forms (id, tenant_id, name, source, source_key, status, service, fields, leads, revenue, conversion)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id, tenantId, form.name, form.source, form.sourceKey,
      form.status, form.service, JSON.stringify(form.fields),
      form.leads, form.revenue, form.conversion,
    ],
  );
  return { success: true, form };
}

async function updateForm(tenantId, id, data) {
  const form = normalizeFormRow({ ...data, id }, id);
  const result = await pool.query(
    `UPDATE forms SET
      name = $3, source = $4, source_key = $5, status = $6, service = $7,
      fields = $8, updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2`,
    [
      tenantId, id, form.name, form.source, form.sourceKey,
      form.status, form.service, JSON.stringify(form.fields),
    ],
  );
  if ((result.rowCount ?? 0) === 0) {
    const err = new Error("Form not found");
    err.statusCode = 404;
    throw err;
  }
  return { success: true, form };
}

async function saveAiInsight(tenantId, insight) {
  await pool.query(
    `INSERT INTO ai_insights (tenant_id, context, type, title, body, tone) VALUES ($1, $2, $3, $4, $5, $6)`,
    [tenantId, insight.context || "dashboard", insight.type || "rec", insight.title, insight.body, insight.tone || "info"],
  );
  return { success: true };
}

async function generateAiInsights(tenantId, context = "dashboard") {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      success: true,
      source: "mock",
      message: "OpenAI API key not configured. Set OPENAI_API_KEY in backend .env when ready.",
      insights: mock.aiInsights,
    };
  }
  return {
    success: true,
    source: "mock",
    message: "OpenAI integration pending full prompt wiring.",
    insights: mock.aiInsights,
  };
}

async function getIncentivesData(tenantId = TENANT, month) {
  const settingsRes = await getSettings(tenantId);
  const settings = settingsRes.settings || mock.DEFAULT_SETTINGS;
  const targetMonth = month || new Date().toISOString().slice(0, 7);

  let teammates = [];
  if (await dbReady()) {
    try {
      const [empRes, callsRes, meetingsRes, leadsRes, cashRes] = await Promise.all([
        pool.query(
          `SELECT id, name, email, role, department, salary, call_target, qualified_lead_target, meeting_target, cash_target,
            incentive_kra, call_weightage, qualified_lead_weightage, meeting_weightage, cash_weightage
           FROM employees WHERE tenant_id = $1 AND status = 'active'`,
          [tenantId],
        ),
        pool.query(
          `SELECT employee_id, COUNT(*) AS total_calls,
             SUM(CASE WHEN duration_sec > 0 THEN 1 ELSE 0 END) AS connected_calls,
             SUM(CASE WHEN duration_sec >= 300 THEN 1 ELSE 0 END) AS conversations_5min_plus
           FROM employee_calls
           WHERE tenant_id = $1 AND DATE_FORMAT(COALESCE(started_at, created_at), '%Y-%m') = $2
           GROUP BY employee_id`,
          [tenantId, targetMonth]
        ),
        pool.query(
          `SELECT employee_id, COUNT(*) AS total_meetings
           FROM meetings
           WHERE tenant_id = $1 AND DATE_FORMAT(COALESCE(scheduled_at, created_at), '%Y-%m') = $2
           GROUP BY employee_id`,
          [tenantId, targetMonth]
        ),
        pool.query(
          `SELECT assigned_to AS employee_id,
             COUNT(*) AS total_leads,
             SUM(CASE WHEN LOWER(COALESCE(pipeline_stage,'')) IN ('booked','call booked','showed up','showed_up')
                 OR LOWER(REPLACE(COALESCE(pipeline_stage,''), '_', ' ')) LIKE '%showed up%'
                 OR LOWER(REPLACE(COALESCE(pipeline_stage,''), '_', ' ')) LIKE '%show up%'
                 OR LOWER(COALESCE(status,'')) IN ('booked','showed up','show up')
                 OR LOWER(REPLACE(COALESCE(status,''), '_', ' ')) LIKE '%showed up%'
                 OR LOWER(REPLACE(COALESCE(status,''), '_', ' ')) LIKE '%show up%'
                 THEN 1 ELSE 0 END) AS qualified_leads,
             SUM(CASE WHEN LOWER(COALESCE(pipeline_stage,'')) IN ('booked','call booked')
                 OR LOWER(COALESCE(status,'')) IN ('booked')
                 THEN 1 ELSE 0 END) AS booked_leads,
             SUM(CASE WHEN LOWER(COALESCE(pipeline_stage,'')) IN ('converted','won','closed won')
                 OR   LOWER(COALESCE(status,''))  IN ('converted','won')
                 THEN 1 ELSE 0 END) AS converted_leads
           FROM leads
           WHERE tenant_id = $1 AND is_deleted = 0
             AND DATE_FORMAT(created_at, '%Y-%m') = $2
           GROUP BY assigned_to`,
          [tenantId, targetMonth]
        ),
        pool.query(
          `SELECT employee_id, COALESCE(SUM(amount), 0) AS total_cash
           FROM cash_collections
           WHERE tenant_id = $1 AND DATE_FORMAT(COALESCE(payment_at, created_at), '%Y-%m') = $2
           GROUP BY employee_id`,
          [tenantId, targetMonth]
        )
      ]);

      const callsMap = {};
      callsRes.rows.forEach(r => {
        callsMap[r.employee_id] = {
          total: Number(r.total_calls) || 0,
          connected: Number(r.connected_calls) || 0,
          conversations5Min: Number(r.conversations_5min_plus) || 0,
        };
      });

      const meetingsMap = {};
      meetingsRes.rows.forEach(r => { meetingsMap[r.employee_id] = Number(r.total_meetings) || 0; });

      const leadsMap = {};
      leadsRes.rows.forEach(r => {
        leadsMap[r.employee_id] = {
          total: Number(r.total_leads) || 0,
          qualified: Number(r.qualified_leads) || 0,
          booked: Number(r.booked_leads) || 0,
          converted: Number(r.converted_leads) || 0
        };
      });

      const cashMap = {};
      cashRes.rows.forEach(r => { cashMap[r.employee_id] = Number(r.total_cash) || 0; });

      teammates = empRes.rows.map((e) => {
        const empCalls = callsMap[e.id] || { total: 0, connected: 0, conversations5Min: 0 };
        const empLeads = leadsMap[e.id] || { total: 0, qualified: 0, booked: 0, converted: 0 };

        const pickupRate = empCalls.total > 0 ? Math.min(100, Math.round((empCalls.connected / empCalls.total) * 100)) : 0;
        const qualificationRate = empLeads.total > 0 ? Math.min(100, Math.round((empLeads.qualified / empLeads.total) * 100)) : 0;
        const conversionRate = empLeads.total > 0 ? Math.min(100, Math.round((empLeads.converted / empLeads.total) * 100)) : 0;
        const objectionHandling = Math.min(99, Math.round(qualificationRate * 0.95) || 0);
        const followUpQuality = pickupRate;

        return {
          id: e.id,
          name: e.name,
          role: e.role || e.department || "Sales Manager",
          department: e.department || "Sales & Growth",
          salary: e.salary || 0,
          callsCompleted: empCalls.conversations5Min || empCalls.total,
          callsTarget: e.call_target || 50,
          qualifiedLeads: empLeads.qualified,
          qualifiedTarget: e.qualified_lead_target || 20,
          meetingsScheduled: empLeads.booked || meetingsMap[e.id] || 0,
          meetingsTarget: e.meeting_target || 15,
          cashCollected: cashMap[e.id] || 0,
          cashTarget: e.cash_target || 100000,
          responseTimeMin: 1.8,
          pickupRate,
          qualificationRate,
          objectionHandling,
          conversionRate,
          followUpQuality,
          targets: {
            calls: e.call_target || 50,
            qualifiedLeads: e.qualified_lead_target || 20,
            meetings: e.meeting_target || 15,
            cash: e.cash_target || 100000,
          },
          weightages: {
            calls: e.call_weightage || 0,
            qualifiedLeads: e.qualified_lead_weightage || 0,
            meetings: e.meeting_weightage || 0,
            cash: e.cash_weightage || 0,
          },
        };
      });
    } catch (err) {
      console.error("Error fetching incentives teammates data:", err);
    }
  }

  return {
    success: true,
    source: teammates.length ? "database" : "mock",
    incentiveSlabs: settings.incentiveSlabs || mock.DEFAULT_SETTINGS.incentiveSlabs,
    kpiWeights: settings.kpiWeights || mock.DEFAULT_SETTINGS.kpiWeights,
    baseIncentiveRate: settings.baseIncentiveRate ?? 2.5,
    targetBonusAmount: settings.targetBonusAmount ?? 2500,
    teammates,
    month: targetMonth,
  };
}

async function getSalesFunnelKPIs(tenantId = TENANT, options = {}) {
  const { employee = "All Employees", service = "All Services" } = options;

  // If DB not available, return empty zeros — no mock data
  if (!(await dbReady())) {
    const emptyMetrics = [
      { label: "Pickup Rate",        shortLabel: "Pickup",   value: 0, rgb: "124,58,237",  desc: "Calls answered vs dialed",       trend: "—" },
      { label: "Qualification Rate", shortLabel: "Qualify",  value: 0, rgb: "220,38,120",  desc: "Qualified vs total leads",        trend: "—" },
      { label: "Conversion Rate",    shortLabel: "Convert",  value: 0, rgb: "16,185,129",  desc: "Closed deals vs total leads",     trend: "—" },
    ];
    return {
      success: true,
      source: "offline",
      kpiData: [
        { label: "Leads Assigned",  value: "0"  },
        { label: "Calls Done",      value: "0"  },
        { label: "Qualified Leads", value: "0"  },
        { label: "Meetings Done",   value: "0"  },
        { label: "Proposal Sent",   value: "0"  },
        { label: "Revenue",         value: "₹0" },
      ],
      oppData: { notContacted: 0, unqualified: 0, noMeeting: 0, stuckNegotiation: 0 },
      metrics: emptyMetrics,
    };
  }

  // ── Build WHERE filters ──────────────────────────────────────────────────────
  let leadsParams = [tenantId];
  let leadsWhere  = "l.tenant_id = $1 AND l.is_deleted = 0";

  if (employee && employee !== "All Employees") {
    leadsParams.push(employee);
    leadsWhere += ` AND l.assigned_to = (SELECT id FROM employees WHERE tenant_id = $1 AND name = $${leadsParams.length} LIMIT 1)`;
  }
  if (service && service !== "All Services") {
    leadsParams.push(`%${service}%`);
    const si = leadsParams.length;
    leadsWhere += ` AND (l.form_name LIKE $${si} OR l.keyword LIKE $${si} OR l.source LIKE $${si})`;
  }

  let callsParams = [tenantId];
  let callsWhere  = "tenant_id = $1";
  if (employee && employee !== "All Employees") {
    callsParams.push(employee);
    callsWhere += ` AND employee_id = (SELECT id FROM employees WHERE tenant_id = $1 AND name = $${callsParams.length} LIMIT 1)`;
  }

  let meetingsParams = [tenantId];
  let meetingsWhere  = "tenant_id = $1";
  if (employee && employee !== "All Employees") {
    meetingsParams.push(employee);
    meetingsWhere += ` AND employee_id = (SELECT id FROM employees WHERE tenant_id = $1 AND name = $${meetingsParams.length} LIMIT 1)`;
  }

  // ── Run queries in parallel ─────────────────────────────────────────────────
  const [leadsResult, callsResult, meetingsResult] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)                                                                         AS total_leads,
         SUM(CASE WHEN LOWER(COALESCE(pipeline_stage,'')) IN ('booked','call booked','showed up','showed_up')
             OR LOWER(REPLACE(COALESCE(pipeline_stage,''), '_', ' ')) LIKE '%showed up%'
             OR LOWER(REPLACE(COALESCE(pipeline_stage,''), '_', ' ')) LIKE '%show up%'
             OR LOWER(COALESCE(status,'')) IN ('booked','showed up','show up')
             OR LOWER(REPLACE(COALESCE(status,''), '_', ' ')) LIKE '%showed up%'
             OR LOWER(REPLACE(COALESCE(status,''), '_', ' ')) LIKE '%show up%'
             THEN 1 ELSE 0 END)                                                          AS qualified_leads,
         SUM(CASE WHEN LOWER(COALESCE(pipeline_stage,'')) IN ('converted','won','closed won')
             OR   LOWER(COALESCE(status,''))  IN ('converted','won')
             THEN 1 ELSE 0 END)                                                          AS converted_leads,
         SUM(CASE WHEN LOWER(COALESCE(pipeline_stage,'')) IN ('proposal sent','negotiation')
             OR   LOWER(COALESCE(status,''))  LIKE '%proposal%'
             THEN 1 ELSE 0 END)                                                          AS proposal_sent,
         SUM(CASE WHEN LOWER(COALESCE(pipeline_stage,'')) IN ('converted','won','closed won')
             OR   LOWER(COALESCE(status,''))  IN ('converted','won')
             THEN COALESCE(expected_revenue,0) ELSE 0 END)                               AS revenue,
         SUM(CASE WHEN LOWER(COALESCE(pipeline_stage,'new lead')) IN ('new lead','attempted')
             AND (interactions IS NULL OR interactions = 0)
             THEN 1 ELSE 0 END)                                                          AS not_contacted,
         SUM(CASE WHEN LOWER(COALESCE(status,''))  IN ('not interested','unqualified')
             THEN 1 ELSE 0 END)                                                          AS unqualified,
         SUM(CASE WHEN LOWER(COALESCE(pipeline_stage,'')) = 'negotiation'
             THEN 1 ELSE 0 END)                                                          AS stuck_negotiation
       FROM leads l
       WHERE ${leadsWhere}`,
      leadsParams
    ),
    pool.query(
      `SELECT
         COUNT(*)                                             AS total_calls,
         SUM(CASE WHEN duration_sec > 0 THEN 1 ELSE 0 END)  AS connected_calls
       FROM employee_calls WHERE ${callsWhere}`,
      callsParams
    ),
    pool.query(
      `SELECT COUNT(*) AS meetings_done FROM meetings WHERE ${meetingsWhere}`,
      meetingsParams
    ),
  ]);

  // ── Compute values ──────────────────────────────────────────────────────────
  const row            = leadsResult.rows[0]   || {};
  const totalLeads     = Number(row.total_leads     || 0);
  const qualifiedLeads = Number(row.qualified_leads || 0);
  const convertedLeads = Number(row.converted_leads || 0);
  const totalCalls     = Number(callsResult.rows[0]?.total_calls     || 0);
  const connectedCalls = Number(callsResult.rows[0]?.connected_calls || 0);
  const meetingsDone   = Number(meetingsResult.rows[0]?.meetings_done || 0);
  const meetingNotScheduled = Math.max(0, qualifiedLeads - meetingsDone);

  // Rates — all capped 0-100
  const pickupRate = totalCalls     > 0 ? Math.min(100, Math.round((connectedCalls / totalCalls)     * 100)) : 0;
  const qualRate   = totalLeads     > 0 ? Math.min(100, Math.round((qualifiedLeads / totalLeads)     * 100)) : 0;
  const convRate   = totalLeads     > 0 ? Math.min(100, Math.round((convertedLeads / totalLeads)     * 100)) : 0;

  return {
    success: true,
    source: "database",
    kpiData: [
      { label: "Leads Assigned",  value: String(totalLeads)                       },
      { label: "Calls Done",      value: String(totalCalls)                        },
      { label: "Qualified Leads", value: String(qualifiedLeads)                    },
      { label: "Meetings Done",   value: String(meetingsDone)                      },
      { label: "Proposal Sent",   value: String(row.proposal_sent || 0)            },
      { label: "Revenue",         value: formatINR(row.revenue    || 0)            },
    ],
    oppData: {
      notContacted:     Number(row.not_contacted    || 0),
      unqualified:      Number(row.unqualified      || 0),
      noMeeting:        meetingNotScheduled,
      stuckNegotiation: Number(row.stuck_negotiation || 0),
    },
    metrics: [
      { label: "Pickup Rate",        shortLabel: "Pickup",  value: pickupRate, rgb: "124,58,237", desc: "Calls answered vs dialed",   trend: `${pickupRate}% pickup` },
      { label: "Qualification Rate", shortLabel: "Qualify", value: qualRate,   rgb: "220,38,120", desc: "Qualified vs total leads",    trend: `${qualRate}% qualified` },
      { label: "Conversion Rate",    shortLabel: "Convert", value: convRate,   rgb: "16,185,129", desc: "Closed deals vs total leads", trend: `${convRate}% converted` },
    ],
  };
}


async function getOppCategoryLeads(tenantId = TENANT, options = {}) {
  const { category, employee, service } = options;

  let params = [tenantId];
  let categoryWhere = "1=1";

  if (category === "not_contacted") {
    categoryWhere = "LOWER(COALESCE(l.pipeline_stage, 'new lead')) = 'new lead' AND (l.interactions IS NULL OR l.interactions = 0)";
  } else if (category === "unqualified") {
    categoryWhere = "(LOWER(COALESCE(l.pipeline_stage, '')) = 'unqualified' OR LOWER(COALESCE(l.status, '')) IN ('not interested', 'unqualified'))";
  } else if (category === "no_meeting") {
    categoryWhere = "(LOWER(COALESCE(l.pipeline_stage, '')) = 'qualified' OR LOWER(COALESCE(l.status, '')) IN ('qualified', 'warm')) AND LOWER(COALESCE(l.pipeline_stage, '')) NOT IN ('meeting', 'meeting booked', 'meeting done', 'demo')";
  } else if (category === "stuck_negotiation") {
    categoryWhere = "LOWER(COALESCE(l.pipeline_stage, '')) = 'negotiation'";
  }

  let extraWhere = "";

  if (employee && employee !== "All Employees") {
    params.push(employee);
    extraWhere += ` AND l.assigned_to = (SELECT id FROM employees WHERE name = $${params.length} LIMIT 1)`;
  }
  if (service && service !== "All Services") {
    params.push(`%${service}%`);
    extraWhere += ` AND (l.form_name LIKE $${params.length} OR l.keyword LIKE $${params.length} OR l.source LIKE $${params.length})`;
  }

  const result = await pool.query(
    `SELECT l.id, l.lead_name, l.phone, l.email, l.city,
            l.pipeline_stage, l.status, l.temperature,
            l.expected_revenue, l.interactions, l.created_at,
            e.name AS assigned_to_name
     FROM leads l
     LEFT JOIN employees e ON e.id = l.assigned_to
     WHERE l.tenant_id = $1 AND l.is_deleted = 0
       AND ${categoryWhere}${extraWhere}
     ORDER BY l.created_at DESC
     LIMIT 100`,
    params
  );

  return { success: true, leads: result.rows };
}

module.exports = {
  TENANT,
  formatINR,
  dbReady,
  getDashboardBundle,
  getPipelineLeads,
  listLeadTasks,
  createLeadTask,
  updateLeadTask,
  getPipelineStatusGrid,
  updatePipelineLeadStage,
  getReportsBundle,
  getSettings,
  saveSettings,
  listServices,
  createService,
  listForms,
  createForm,
  updateForm,
  saveAiInsight,
  generateAiInsights,
  getIncentivesData,
  getAiInsightsFromDb,
  getSalesFunnelKPIs,
  getOppCategoryLeads,
};
