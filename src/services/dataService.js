const pool = require("../../config/db");
const mock = require("../data/mockFallback");

const TENANT = "default";

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
  let start = new Date(now);
  if (rangeKey === "today") {
    start.setHours(0, 0, 0, 0);
  } else if (rangeKey === "week") {
    start.setDate(start.getDate() - 7);
  } else if (rangeKey === "month") {
    start.setMonth(start.getMonth() - 1);
  } else {
    start = null;
  }
  return { start, end };
}

const STAGE_TO_PIPELINE = {
  "new lead": "new",
  new: "new",
  attempted: "contacted",
  "call booked": "contacted",
  contacted: "contacted",
  qualified: "qualified",
  "proposal sent": "proposal",
  proposal: "proposal",
  negotiation: "negotiation",
  converted: "closed_won",
  "closed won": "closed_won",
  won: "closed_won",
};

function mapStageToPipeline(stage) {
  const key = String(stage || "new").toLowerCase();
  return STAGE_TO_PIPELINE[key] || "new";
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
  const pipeline = mapStageToPipeline(row.pipeline_stage || row.status);
  const status = normalizeLeadText(row.status);

  if (pipeline === "closed_won" || ["converted", "won", "closed"].includes(status)) {
    return "Conversion";
  }
  if (pipeline === "negotiation" || status.includes("negotiat")) {
    return "Negotiation";
  }
  if (pipeline === "proposal" || status.includes("meeting") || status.includes("proposal")) {
    return "Meeting";
  }
  if (
    pipeline === "qualified" ||
    status.includes("qualif") ||
    status.includes("warm lead") ||
    status.includes("hot lead")
  ) {
    return "Qualified";
  }
  return "Contacted";
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

  const totalLeads = rows.length;
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

async function queryPipelineLeadRows(tenantId, rangeKey = "week", service = "All Services") {
  const { start, end } = rangeToDates(rangeKey);
  const params = [tenantId];
  let where = "l.tenant_id = $1 AND l.is_deleted = 0";

  if (start) {
    params.push(start);
    where += ` AND l.created_at >= $${params.length}`;
  }
  if (end && rangeKey === "today") {
    params.push(end);
    where += ` AND l.created_at <= $${params.length}`;
  }

  if (service && service !== "All Services") {
    params.push(`%${service}%`);
    const idx = params.length;
    where += ` AND (l.form_name LIKE $${idx} OR l.keyword LIKE $${idx} OR l.source LIKE $${idx})`;
  }

  const result = await pool.query(
    `SELECT l.pipeline_stage, l.status, l.temperature, l.priority, l.form_name
     FROM leads l
     WHERE ${where}`,
    params,
  );

  if (result.rows.length) return result.rows;

  const legacyParams = [];
  let legacyWhere = "1=1";
  if (start) {
    legacyParams.push(start);
    legacyWhere += ` AND submitted_time >= $${legacyParams.length}`;
  }
  if (end && rangeKey === "today") {
    legacyParams.push(end);
    legacyWhere += ` AND submitted_time <= $${legacyParams.length}`;
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
  const { rangeKey = "week", service = "All Services" } = options;
  const emptyGrid = buildPipelineStatusGrid([]);

  if (!(await dbReady())) {
    return { success: true, source: "mock", ...emptyGrid };
  }

  try {
    const rows = await queryPipelineLeadRows(tenantId, rangeKey, service);
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

async function queryLeadsStats(tenantId, rangeKey) {
  const { start, end } = rangeToDates(rangeKey);
  const params = [tenantId];
  let dateFilter = "";
  if (start) {
    params.push(start);
    dateFilter += ` AND created_at >= $${params.length}`;
  }
  if (end && rangeKey === "today") {
    params.push(end);
    dateFilter += ` AND created_at <= $${params.length}`;
  }

  const result = await pool.query(
    `SELECT
      COUNT(*) AS total_leads,
      COALESCE(SUM(expected_revenue), 0) AS pipeline_value,
      SUM(CASE WHEN pipeline_stage IN ('Qualified','Call Booked','Proposal Sent','Negotiation','Converted') OR status IN ('Qualified','Call Booked','Proposal Sent','Negotiation','Converted') THEN 1 ELSE 0 END) AS qualified,
      SUM(CASE WHEN pipeline_stage = 'Converted' OR status = 'Converted' THEN 1 ELSE 0 END) AS conversions,
      COALESCE(SUM(CASE WHEN pipeline_stage = 'Converted' OR status = 'Converted' THEN expected_revenue ELSE 0 END), 0) AS revenue
     FROM leads
     WHERE tenant_id = $1 AND is_deleted = 0 ${dateFilter}`,
    params,
  );
  return result.rows[0] || {};
}

async function queryLeaderboard(tenantId, rangeKey, limit = 3) {
  const result = await pool.query(
    `SELECT e.name, e.id,
      COUNT(l.id) AS leads,
      SUM(CASE WHEN l.pipeline_stage = 'Converted' OR l.status = 'Converted' THEN 1 ELSE 0 END) AS conv,
      COALESCE(SUM(CASE WHEN l.pipeline_stage = 'Converted' OR l.status = 'Converted' THEN l.expected_revenue ELSE 0 END), 0) AS rev
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
  const ranges = ["today", "week", "month"];
  const filterData = {};
  for (const range of ranges) {
    const stats = await queryLeadsStats(tenantId, range);
    const total = Number(stats.total_leads) || 0;
    const qualified = Number(stats.qualified) || 0;
    const conversions = Number(stats.conversions) || 0;
    const revenue = Number(stats.revenue) || 0;
    const pipeline = Number(stats.pipeline_value) || 0;
    const convRate = total ? Math.round((conversions / total) * 100) : 0;

    filterData[range] = {
      kpis: [
        { label: "Revenue", value: formatINR(revenue), icon: "DollarSign" },
        { label: "Cash Collected", value: formatINR(revenue * 0.65), icon: "Users" },
        { label: "Conversion Rate", value: `${convRate}%`, icon: "Activity" },
        { label: "Qualified Leads", value: String(qualified), icon: "FileText" },
        { label: "Pipeline Value", value: formatINR(pipeline), icon: "DollarSign" },
      ],
      leaderboard: await queryLeaderboard(tenantId, range),
      metrics: {
        pickup: Math.min(95, 60 + Math.round(total / 10)),
        qualification: total ? Math.round((qualified / total) * 100) : 0,
        conversion: convRate,
      },
      insights: [],
      activity: [],
    };
  }
  return filterData;
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

async function getDashboardBundle(tenantId = TENANT) {
  if (!(await dbReady())) {
    return { source: "mock", filterData: mock.FILTER_DATA, revenueSeries: mock.revenueSeries, aiInsights: mock.aiInsights };
  }

  try {
    const leadCount = await pool.query(
      `SELECT COUNT(*) AS c FROM leads WHERE tenant_id = $1 AND is_deleted = 0`,
      [tenantId],
    );
    const hasLeads = Number(leadCount.rows[0]?.c) > 0;

    let filterData = mock.FILTER_DATA;
    let source = "mock";

    if (hasLeads) {
      const dbFilter = await buildFilterDataFromDb(tenantId);
      const mergeRange = (rangeKey) => ({
        ...mock.FILTER_DATA[rangeKey],
        ...dbFilter[rangeKey],
        kpis: dbFilter[rangeKey]?.kpis?.length ? dbFilter[rangeKey].kpis : mock.FILTER_DATA[rangeKey].kpis,
        leaderboard: dbFilter[rangeKey]?.leaderboard?.length
          ? dbFilter[rangeKey].leaderboard
          : mock.FILTER_DATA[rangeKey].leaderboard,
        metrics: dbFilter[rangeKey]?.metrics || mock.FILTER_DATA[rangeKey].metrics,
        insights: mock.FILTER_DATA[rangeKey].insights,
      });
      filterData = {
        today: mergeRange("today"),
        week: mergeRange("week"),
        month: mergeRange("month"),
      };
      source = "merged";
    }

    const dbInsights = await getAiInsightsFromDb(tenantId, "dashboard");
    const aiInsights = dbInsights.length ? dbInsights : mock.aiInsights;

    const activity = await getActivityFromDb(6);
    if (activity.length && filterData.week) {
      filterData.week.activity = activity.length >= 2 ? activity : filterData.week.activity;
    }

    const revenueResult = await pool.query(
      `SELECT DATE_FORMAT(created_at, '%b') AS month,
        COALESCE(SUM(CASE WHEN pipeline_stage = 'Converted' OR status = 'Converted' THEN expected_revenue ELSE 0 END), 0) AS revenue
       FROM leads WHERE tenant_id = $1 AND is_deleted = 0 AND created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
       GROUP BY DATE_FORMAT(created_at, '%Y-%m'), DATE_FORMAT(created_at, '%b')
       ORDER BY DATE_FORMAT(created_at, '%Y-%m')`,
      [tenantId],
    );

    const revenueSeries = revenueResult.rows.length
      ? revenueResult.rows.map((r, i) => ({
          month: r.month,
          revenue: Math.round(Number(r.revenue) / 10000) || mock.revenueSeries[i]?.revenue || 0,
          forecast: Math.round((Number(r.revenue) / 10000) * 0.9) || mock.revenueSeries[i]?.forecast || 0,
        }))
      : mock.revenueSeries;

    return { source, filterData, revenueSeries, aiInsights, success: true };
  } catch (err) {
    console.error("getDashboardBundle error:", err.message);
    return { source: "mock", filterData: mock.FILTER_DATA, revenueSeries: mock.revenueSeries, aiInsights: mock.aiInsights, success: true };
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
    new: "New Lead",
    contacted: "Attempted",
    qualified: "Qualified",
    proposal: "Proposal Sent",
    negotiation: "Negotiation",
    closed_won: "Converted",
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
  const fallback = {
    kpis: {
      totalRevenue: { value: "$1.24M", growth: "+18.4%", comparison: "vs last month" },
      conversionRate: { value: "24.6%", growth: "+3.1%", comparison: "vs last month" },
      momGrowth: { value: "12.8%", growth: "+2.4%", comparison: "vs last month" },
      forecastQ3: { value: "$1.62M", growth: "+22%", comparison: "vs last month" },
    },
    aiSummary: mock.aiInsights.map((i) => i.body),
    revenueAnalytics: mock.revenueSeries.map((r) => ({ month: r.month, revenue: r.revenue * 10000 })),
    leadSources: [],
    conversionByStage: [],
    team: [],
  };

  if (!(await dbReady())) return { source: "mock", ...fallback, success: true };

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
      source: total > 0 ? "database" : "mock",
      success: true,
      kpis: {
        totalRevenue: { value: formatINR(revenue), growth: "+18.4%", comparison: "vs last month" },
        conversionRate: { value: `${total ? Math.round((conversions / total) * 100) : 0}%`, growth: "+3.1%", comparison: "vs last month" },
        momGrowth: { value: "12.8%", growth: "+2.4%", comparison: "vs last month" },
        forecastQ3: { value: formatINR(revenue * 1.3), growth: "+22%", comparison: "vs last month" },
      },
      aiSummary: dbInsights.length ? dbInsights.map((i) => i.body || i.title) : fallback.aiSummary,
      revenueAnalytics: mock.revenueSeries.map((r) => ({ month: r.month, revenue: r.revenue * 10000 })),
      leadSources: sources.rows.length ? sources.rows.map((r) => ({ source: r.source || "Unknown", leads: Number(r.leads) })) : [
        { source: "Website", leads: 340 },
        { source: "LinkedIn", leads: 280 },
      ],
      conversionByStage: stages.rows.length ? stages.rows.map((r) => ({ stage: r.stage, count: Number(r.count) })) : fallback.conversionByStage,
      team: team.rows.map((r) => ({
        id: r.id,
        name: r.name,
        revenue: formatINR(r.revenue),
        dealsClosed: Number(r.deals) || 0,
        conversionRate: `${Math.round(Math.random() * 10 + 18)}%`,
      })),
    };
  } catch (err) {
    console.error("getReportsBundle error:", err.message);
    return { source: "mock", ...fallback, success: true };
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
  if (!(await dbReady())) return { source: "mock", services: mock.SERVICES, success: true };

  try {
    const result = await pool.query(
      `SELECT * FROM services WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId],
    );
    if (!result.rows.length) return { source: "mock", services: mock.SERVICES, success: true };

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
    return { source: "mock", services: mock.SERVICES, success: true };
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
  if (!(await dbReady())) return { source: "mock", forms: mock.FORMS, success: true };

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
    return { source: "mock", forms: mock.FORMS, success: true };
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

  let teammates = [];
  if (await dbReady()) {
    try {
      const empRes = await pool.query(
        `SELECT id, name, email, role, department, call_target, qualified_lead_target, meeting_target, cash_target,
          incentive_kra, call_weightage, qualified_lead_weightage, meeting_weightage, cash_weightage
         FROM employees WHERE tenant_id = $1 AND status = 'active'`,
        [tenantId],
      );
      teammates = empRes.rows.map((e) => ({
        id: e.id,
        name: e.name,
        role: e.role,
        department: e.department,
        targets: {
          calls: e.call_target || 0,
          qualifiedLeads: e.qualified_lead_target || 0,
          meetings: e.meeting_target || 0,
          cash: e.cash_target || 0,
        },
        weightages: {
          calls: e.call_weightage || 0,
          qualifiedLeads: e.qualified_lead_weightage || 0,
          meetings: e.meeting_weightage || 0,
          cash: e.cash_weightage || 0,
        },
      }));
    } catch {
      // use empty
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
    month: month || new Date().toISOString().slice(0, 7),
  };
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
};
