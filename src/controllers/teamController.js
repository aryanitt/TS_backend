const pool = require("../../config/db");
const {
  logActivity,
  createNotification,
} = require("./activityController");

const getTeamDashboard = (req, res) => {
  res.json({
    kpis: {
      totalEmployees: 48,
      activeEmployees: 42,
      onLeave: 3,
      remoteEmployees: 18,
      totalCalls: 1240,
      meetings: 186,
      convertedLeads: 84,
      revenue: "₹24.8L"
    },

    productivityTrend: [
      { month: "Jan", productivity: 68 },
      { month: "Feb", productivity: 72 },
      { month: "Mar", productivity: 76 },
      { month: "Apr", productivity: 81 },
      { month: "May", productivity: 86 }
    ],

    aiInsights: [
      "Sales team productivity increased by 12%",
      "3 employees exceeded monthly targets",
      "Support team response time improved by 18%"
    ],

    attendanceToday: {
      present: 42,
      absent: 3,
      leave: 3
    },

    workloadDistribution: [
      {
        department: "Sales",
        workload: 35
      },
      {
        department: "Support",
        workload: 25
      },
      {
        department: "Engineering",
        workload: 40
      }
    ]
  });
};

const getTeamPerformance = (req, res) => {
  res.json({
    topPerformers: [
      {
        id: 1,
        name: "Priya",
        revenue: "₹4.2L"
      },
      {
        id: 2,
        name: "Rahul",
        revenue: "₹3.8L"
      }
    ],

    monthlyTargets: [
      {
        employee: "Priya",
        target: "₹5L",
        achieved: "₹4.2L"
      },
      {
        employee: "Rahul",
        target: "₹4L",
        achieved: "₹3.8L"
      }
    ],

    recentClosedDeals: [
      {
        company: "Infosys",
        value: "₹2.4L"
      },
      {
        company: "TCS",
        value: "₹1.8L"
      }
    ],

    pipelineSnapshot: [
      {
        stage: "New",
        count: 120
      },
      {
        stage: "Qualified",
        count: 80
      },
      {
        stage: "Proposal",
        count: 42
      }
    ]
  });
};

const getEmployees = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.*,
        (SELECT COUNT(*) FROM leads l WHERE l.assigned_to = e.id AND l.is_deleted = 0) AS leads,
        (SELECT COUNT(*) FROM leads l
          WHERE l.assigned_to = e.id AND l.is_deleted = 0
            AND (l.pipeline_stage = 'Converted' OR l.status = 'Converted')) AS conv
       FROM employees e
       ORDER BY e.id DESC`,
    );
    res.json({
      success: true,
      employees: result.rows,
    });
  } catch (error) {
    console.error("Error fetching employees:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch employees",
      error: error.message,
    });
  }
};

const createEmployee = async (req, res) => {
  try {
    const {
      name, email, phone, city, department, role,
      status, work_location, access_level, notes,
      joining_date, callyser_id, emp_id,
      salary,
      incentive_kra,
      call_target, call_weightage,
      qualified_lead_target, qualified_lead_weightage,
      meeting_target, meeting_weightage,
      cash_target, cash_weightage,
    } = req.body;

    const result = await pool.query(
      `INSERT INTO employees (
        name, email, phone, city, department, role,
        status, work_location, access_level, notes,
        joining_date, callyser_id, emp_id,
        salary,
        incentive_kra,
        call_target, call_weightage,
        qualified_lead_target, qualified_lead_weightage,
        meeting_target, meeting_weightage,
        cash_target, cash_weightage
      ) VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,$10,
        $11,$12,$13,
        $14,
        $15,
        $16,$17,
        $18,$19,
        $20,$21,
        $22,$23
      ) RETURNING *`,
      [
        name, email || null, phone || null, city || null,
        department || null, role || null,
        status || "active", work_location || "Office",
        access_level || "Member", notes || null,
        joining_date || null, callyser_id || null, emp_id || null,
        salary != null ? salary : null,
        incentive_kra || false,
        call_target || 0, call_weightage || 0,
        qualified_lead_target || 0, qualified_lead_weightage || 0,
        meeting_target || 0, meeting_weightage || 0,
        cash_target || 0, cash_weightage || 0,
      ]
    );

    const employee = result.rows[0];

    await logActivity({
      action: `Added new employee: ${employee.name}`,
      entity: "employee",
      entity_id: employee.id,
    });

   await createNotification({
  title: `${employee.name} joined the team`,
  message: `${employee.name} was added as ${employee.role || "team member"} in ${employee.department || "the company"}`,
  type: "employee",
});

    res.status(201).json({ success: true, employee });

  } catch (error) {
    console.error("Error creating employee:", error);
    res.status(500).json({ success: false, message: "Failed to create employee", error: error.message });
  }
};

const getEmployeeDetails = (req, res) => {
  const { id } = req.params;

  res.json({
    id,
    name: "Priya Sharma",
    role: "Sales Manager",
    department: "Sales",
    email: "priya@company.com",
    phone: "+91 9876543210",
    performance: "92%",
    attendance: "96%",
    revenueGenerated: "₹4.2L"
  });
};

const getEmployeeLeads = async (req, res) => {
  try {
    const { employee_name } = req.query;

    if (!employee_name) {
      return res.json({ success: true, leads: [], stats: {} });
    }

    // Fetch all leads for this employee
    const result = await pool.query(
      `SELECT 
          id,
          lead_name,
          business_name,
          email,
          phone,
          city,
          form_name,
          temperature,
          expected_revenue,
          pipeline_stage,
          status,
          submitted_time,
          updated_at,
          round_robin_code,
          source,
          employee_name
       FROM emp_leads
       WHERE LOWER(employee_name) = LOWER($1)
          OR LOWER(employee_name) LIKE LOWER($2)
       ORDER BY updated_at DESC`,
      [
        employee_name,
        `${employee_name.split(" ")[0]}%`,
      ]
    );

    const leads = result.rows;

    // ── Calculate KPI stats from real data ──────────────────────────────
   const normalize = s => (s || "").toLowerCase().trim();

const stats = {
  totalLeads:    leads.length,

  // Qualified = Warm Lead, Hot Lead
  qualified:     leads.filter(l =>
                   normalize(l.status) === "warm lead" ||
                   normalize(l.status) === "hot lead"
                 ).length,

  // Meetings = meeting scheduled, meeting booked, meeting done
  totalMeetings: leads.filter(l =>
                   normalize(l.status).includes("meeting")
                 ).length,

  // Converted
  converted:     leads.filter(l =>
                   normalize(l.status) === "converted"
                 ).length,

  // Follow-ups = not interested, not attending, call back later
  followUps:     leads.filter(l =>
                   normalize(l.status) === "not interested"  ||
                   normalize(l.status) === "not attending"   ||
                   normalize(l.status) === "call back later"
                 ).length,

  // Extra breakdowns (useful for future)
  newLeads:      leads.filter(l => normalize(l.status) === "new lead").length,
  warmLeads:     leads.filter(l => normalize(l.status) === "warm lead").length,
  hotLeads:      leads.filter(l => normalize(l.status) === "hot lead").length,
  callBackLater: leads.filter(l => normalize(l.status) === "call back later").length,
};

    // ── Activity timeline — last 10 status changes ───────────────────────
    const activity = leads
      .filter(l => l.updated_at && l.status)
      .slice(0, 10)
      .map(l => ({
        lead_name:    l.lead_name,
        status:       l.status,
        time:         l.updated_at,
        business:     l.business_name || "",
      }));

    // ── Funnel — ordered by pipeline stage ───────────────────────────────
   const funnel = [
  { 
    name: "Assigned",  
    value: leads.length 
  },
  { 
    name: "Contacted", 
    value: leads.filter(l => normalize(l.status) !== "new lead").length 
  },
  { 
    name: "Warm/Hot",  
    value: stats.qualified 
  },
  { 
    name: "Meeting",   
    value: stats.totalMeetings 
  },
  { 
    name: "Converted", 
    value: stats.converted 
  },
];

    res.json({ 
      success: true, 
      leads, 
      stats, 
      activity,
      funnel,
    });

  } catch (error) {
    console.error("Error fetching employee leads:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch leads",
      error: error.message,
    });
  }
};
const updateEmployee = async (req, res) => {
  try {
    const {
      id, name, email, phone, city, department, role,
      status, work_location, access_level, notes,
      joining_date, callyser_id, emp_id,
      salary,
      incentive_kra,
      call_target, call_weightage,
      qualified_lead_target, qualified_lead_weightage,
      meeting_target, meeting_weightage,
      cash_target, cash_weightage,
    } = req.body;

    if (!id) {
      return res.status(400).json({ success: false, message: "Employee ID is required" });
    }

    const result = await pool.query(
      `UPDATE employees SET
        name=$1, email=$2, phone=$3, city=$4, department=$5, role=$6,
        status=$7, work_location=$8, access_level=$9, notes=$10,
        joining_date=$11, callyser_id=$12, emp_id=$13,
        salary=$14,
        incentive_kra=$15,
        call_target=$16, call_weightage=$17,
        qualified_lead_target=$18, qualified_lead_weightage=$19,
        meeting_target=$20, meeting_weightage=$21,
        cash_target=$22, cash_weightage=$23,
        updated_at=NOW()
      WHERE id=$24 RETURNING *`,
      [
        name, email || null, phone || null, city || null,
        department || null, role || null,
        status || "active", work_location || "Office",
        access_level || "Member", notes || null,
        joining_date || null, callyser_id || null, emp_id || null,
        salary != null ? salary : null,
        incentive_kra || false,
        call_target || 0, call_weightage || 0,
        qualified_lead_target || 0, qualified_lead_weightage || 0,
        meeting_target || 0, meeting_weightage || 0,
        cash_target || 0, cash_weightage || 0,
        id,
      ]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ success: false, message: "Employee not found" });

    const employee = result.rows[0];

    await logActivity({
      action: `Updated employee: ${employee.name}`,
      entity: "employee",
      entity_id: employee.id,
    });

   await createNotification({
  title: `${employee.name}'s profile updated`,
  message: `${employee.name} (${employee.role || "team member"}) details were modified`,
  type: "employee",
});

    res.json({ success: true, employee });

  } catch (error) {
    console.error("Error updating employee:", error);
    res.status(500).json({ success: false, message: "Failed to update employee", error: error.message });
  }
};

const deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || id === "undefined") {
      return res.status(400).json({ success: false, message: "Invalid employee ID" });
    }

    // ✅ fetch name BEFORE deleting so logs have the actual name
    const findResult = await pool.query(
      "SELECT name, role FROM employees WHERE id=$1",
      [parseInt(id)]
    );

    if (findResult.rows.length === 0)
      return res.status(404).json({ success: false, message: "Employee not found" });

    const employeeName = findResult.rows[0].name;
    const employeeRole = findResult.rows[0].role;

    await pool.query("DELETE FROM employees WHERE id=$1", [parseInt(id)]);

    await logActivity({
      action: `Deleted employee: ${employeeName}`,
      entity: "employee",
      entity_id: parseInt(id),
    });

   await createNotification({
  title: `${employeeName} was removed`,
  message: `${employeeName} (${employeeRole || "team member"}) has been removed from the team`,
  type: "employee",
});

    res.json({ success: true, message: "Employee deleted successfully" });

  } catch (error) {
    console.error("Error deleting employee:", error);
    res.status(500).json({ success: false, message: "Failed to delete employee", error: error.message });
  }
};

const getTeamKPIs = async (req, res) => {
  try {
    const { range, startDate, endDate } = req.query;

    // Build date filter
    let dateFilter = "";
    let params     = [];

    if (range === "Today") {
      dateFilter = `AND DATE(submitted_time) = CURDATE()`;
    } else if (range === "This Week") {
      dateFilter = `AND submitted_time >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)
                    AND submitted_time < DATE_ADD(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), INTERVAL 7 DAY)`;
    } else if (range === "Custom" && startDate && endDate) {
      dateFilter = `AND DATE(submitted_time) >= $1 AND DATE(submitted_time) <= $2`;
      params     = [startDate, endDate];
    } else {
      dateFilter = `AND submitted_time >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
                    AND submitted_time < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)`;
    }

    const empResult = await pool.query(
      `SELECT COUNT(*) AS total_employees FROM employees`
    );

    const leadsResult = await pool.query(
      `SELECT
        COUNT(*) AS total_leads,
        SUM(CASE WHEN LOWER(TRIM(status)) LIKE '%meeting%' THEN 1 ELSE 0 END) AS total_meetings,
        SUM(CASE WHEN LOWER(TRIM(status)) = 'converted' THEN 1 ELSE 0 END) AS total_converted
       FROM emp_leads
       WHERE 1=1 ${dateFilter}`,
      params
    );

    const empRow   = empResult.rows[0];
    const leadsRow = leadsResult.rows[0];

    res.json({
      success: true,
      kpis: {
        totalEmployees: parseInt(empRow.total_employees),
        totalMeetings:  parseInt(leadsRow.total_meetings)  || 0,
        convertedLeads: parseInt(leadsRow.total_converted) || 0,
        totalLeads:     parseInt(leadsRow.total_leads)     || 0,
      },
    });

  } catch (error) {
    console.error("Error fetching KPIs:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch KPIs",
      error: error.message,
    });
  }
};

const getChartData = async (req, res) => {
  try {
    const { range, startDate, endDate } = req.query;

    let query = "";
    let labels = [];

    if (range === "Today") {
      query = `
        SELECT 
          HOUR(submitted_time) AS period,
          COUNT(*) AS total_leads,
          SUM(CASE WHEN LOWER(TRIM(status)) IN ('warm lead','hot lead','contacted') THEN 1 ELSE 0 END) AS qualified,
          SUM(CASE WHEN LOWER(TRIM(status)) LIKE '%meeting%' THEN 1 ELSE 0 END) AS meetings,
          SUM(CASE WHEN LOWER(TRIM(status)) = 'converted' THEN 1 ELSE 0 END) AS converted
        FROM emp_leads
        WHERE DATE(submitted_time) = CURDATE()
        GROUP BY period ORDER BY period
      `;
      labels = Array.from({ length: 13 }, (_, i) => {
        const h = i + 8;
        return {
          key: h,
          label: h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`,
        };
      });

    } else if (range === "This Week") {
      query = `
        SELECT 
          (DAYOFWEEK(submitted_time) - 1) AS period,
          COUNT(*) AS total_leads,
          SUM(CASE WHEN LOWER(TRIM(status)) IN ('warm lead','hot lead','contacted') THEN 1 ELSE 0 END) AS qualified,
          SUM(CASE WHEN LOWER(TRIM(status)) LIKE '%meeting%' THEN 1 ELSE 0 END) AS meetings,
          SUM(CASE WHEN LOWER(TRIM(status)) = 'converted' THEN 1 ELSE 0 END) AS converted
        FROM emp_leads
        WHERE submitted_time >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)
          AND submitted_time < DATE_ADD(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), INTERVAL 7 DAY)
        GROUP BY period ORDER BY period
      `;
      labels = [
        { key: 1, label: "Mon" },
        { key: 2, label: "Tue" },
        { key: 3, label: "Wed" },
        { key: 4, label: "Thu" },
        { key: 5, label: "Fri" },
        { key: 6, label: "Sat" },
        { key: 0, label: "Sun" },
      ];

    } else if (range === "Custom" && startDate && endDate) {
      query = `
        SELECT 
          DATE(submitted_time) AS period,
          COUNT(*) AS total_leads,
          SUM(CASE WHEN LOWER(TRIM(status)) IN ('warm lead','hot lead','contacted') THEN 1 ELSE 0 END) AS qualified,
          SUM(CASE WHEN LOWER(TRIM(status)) LIKE '%meeting%' THEN 1 ELSE 0 END) AS meetings,
          SUM(CASE WHEN LOWER(TRIM(status)) = 'converted' THEN 1 ELSE 0 END) AS converted
        FROM emp_leads
        WHERE DATE(submitted_time) >= $1
          AND DATE(submitted_time) <= $2
        GROUP BY period ORDER BY period
      `;

      // Build all dates in range
      const start = new Date(startDate);
      const end   = new Date(endDate);
      const dates = [];
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const copy = new Date(d);
        dates.push({
          key: copy.toISOString().split("T")[0],
          label: copy.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
        });
      }
      labels = dates;

      const result = await pool.query(query, [startDate, endDate]);
      const dataMap = {};
      result.rows.forEach(r => {
        const key = new Date(r.period).toISOString().split("T")[0];
        dataMap[key] = {
          total_leads: parseInt(r.total_leads) || 0,
          qualified:   parseInt(r.qualified)   || 0,
          meetings:    parseInt(r.meetings)     || 0,
          converted:   parseInt(r.converted)   || 0,
        };
      });

      const chartData = labels.map(({ key, label }) => {
        const d = dataMap[key] || {};
        return {
          t:          label,
          totalLeads: d.total_leads || 0,
          qualified:  d.qualified   || 0,
          meetings:   d.meetings    || 0,
          converted:  d.converted   || 0,
        };
      });

      const hasData = chartData.some(d => d.totalLeads > 0);
      return res.json({ success: true, chartData, hasData });

    } else {
      // This Month — group by day
      query = `
        SELECT 
          DAY(submitted_time) AS period,
          COUNT(*) AS total_leads,
          SUM(CASE WHEN LOWER(TRIM(status)) IN ('warm lead','hot lead','contacted') THEN 1 ELSE 0 END) AS qualified,
          SUM(CASE WHEN LOWER(TRIM(status)) LIKE '%meeting%' THEN 1 ELSE 0 END) AS meetings,
          SUM(CASE WHEN LOWER(TRIM(status)) = 'converted' THEN 1 ELSE 0 END) AS converted
        FROM emp_leads
        WHERE submitted_time >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
          AND submitted_time < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
        GROUP BY period ORDER BY period
      `;
      const now = new Date();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      labels = Array.from({ length: daysInMonth }, (_, i) => ({
        key:   i + 1,
        label: `${i + 1}`,
      }));
    }

    // For Today, This Week, This Month
    const result = await pool.query(query);
    const dataMap = {};
    result.rows.forEach(r => {
      dataMap[parseInt(r.period)] = {
        total_leads: parseInt(r.total_leads) || 0,
        qualified:   parseInt(r.qualified)   || 0,
        meetings:    parseInt(r.meetings)    || 0,
        converted:   parseInt(r.converted)  || 0,
      };
    });

    const chartData = labels.map(({ key, label }) => {
      const d = dataMap[key] || {};
      return {
        t:          label,
        totalLeads: d.total_leads || 0,
        qualified:  d.qualified   || 0,
        meetings:   d.meetings    || 0,
        converted:  d.converted   || 0,
      };
    });

    const hasData = chartData.some(d => d.totalLeads > 0);
    res.json({ success: true, chartData, hasData });

  } catch (error) {
    console.error("Chart data error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
module.exports = {
  getTeamDashboard,
  getTeamPerformance,
  getEmployees,
  getEmployeeDetails,
  getEmployeeLeads,      // ← new name
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getTeamKPIs,
  getChartData,
};