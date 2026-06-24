const pool = require("../config/db");

async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sops (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        category VARCHAR(100) DEFAULT 'Sales Call',
        status VARCHAR(50) DEFAULT 'Draft',
        priority VARCHAR(50) DEFAULT 'Medium',
        department VARCHAR(100) DEFAULT '',
        estimated_time VARCHAR(50) DEFAULT '',
        script TEXT,
        questions JSONB DEFAULT '[]'::jsonb,
        frameworks JSONB DEFAULT '[]'::jsonb,
        tags JSONB DEFAULT '[]'::jsonb,
        instruction_steps JSONB DEFAULT '[]'::jsonb,
        attachment_url TEXT,
        version VARCHAR(20) DEFAULT 'v1.0',
        creator VARCHAR(100) DEFAULT 'Admin',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sop_comments (
        id SERIAL PRIMARY KEY,
        sop_id INTEGER NOT NULL REFERENCES sops(id) ON DELETE CASCADE,
        author VARCHAR(100) DEFAULT 'Current User',
        text TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        city VARCHAR(100),
        department VARCHAR(100),
        role VARCHAR(100),
        status VARCHAR(50) DEFAULT 'active',
        work_location VARCHAR(50) DEFAULT 'Office',
        access_level VARCHAR(50) DEFAULT 'Member',
        notes TEXT,
        joining_date DATE,
        callyser_id VARCHAR(100),
        emp_id VARCHAR(100),
        salary NUMERIC(12, 2),
        incentive_kra BOOLEAN DEFAULT false,
        call_target INTEGER DEFAULT 0,
        call_weightage INTEGER DEFAULT 0,
        qualified_lead_target INTEGER DEFAULT 0,
        qualified_lead_weightage INTEGER DEFAULT 0,
        meeting_target INTEGER DEFAULT 0,
        meeting_weightage INTEGER DEFAULT 0,
        cash_target INTEGER DEFAULT 0,
        cash_weightage INTEGER DEFAULT 0,
        tenant_id VARCHAR(50) DEFAULT 'default',
        avatar_url TEXT,
        initials VARCHAR(10),
        manager_id INTEGER REFERENCES employees(id),
        territory VARCHAR(100),
        max_active_leads INTEGER DEFAULT 40,
        current_active_leads INTEGER DEFAULT 0,
        receiving_paused BOOLEAN DEFAULT false,
        daily_limit INTEGER DEFAULT 25,
        metrics JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS salary NUMERIC(12, 2);`);
    await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50) DEFAULT 'default';`);
    await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS avatar_url TEXT;`);
    await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS initials VARCHAR(10);`);
    await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS manager_id INTEGER;`);
    await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS territory VARCHAR(100);`);
    await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS max_active_leads INTEGER DEFAULT 40;`);
    await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS current_active_leads INTEGER DEFAULT 0;`);
    await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS receiving_paused BOOLEAN DEFAULT false;`);
    await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS daily_limit INTEGER DEFAULT 25;`);
    await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS metrics JSONB DEFAULT '{}'::jsonb;`);
    await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();`);
    await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        lead_name VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        email VARCHAR(255),
        city VARCHAR(100),
        company_name VARCHAR(255),
        source VARCHAR(100),
        keyword VARCHAR(255),
        ad_content TEXT,
        campaign_notes TEXT,
        win_probability INTEGER DEFAULT 50,
        purchased VARCHAR(50),
        expected_close_date DATE,
        interactions INTEGER DEFAULT 0,
        next_followup_date DATE,
        mom TEXT,
        call_summary TEXT,
        notes TEXT,
        temperature VARCHAR(50) DEFAULT 'warm',
        pipeline_stage VARCHAR(100) DEFAULT 'new',
        status VARCHAR(100) DEFAULT 'New Lead',
        expected_revenue NUMERIC(12, 2) DEFAULT 0,
        form_name VARCHAR(255),
        tenant_id VARCHAR(50) DEFAULT 'default',
        country VARCHAR(100) DEFAULT 'India',
        source_meta JSONB DEFAULT '{}'::jsonb,
        currency VARCHAR(10) DEFAULT 'INR',
        priority VARCHAR(20) DEFAULT 'medium',
        assignment_status VARCHAR(30) DEFAULT 'unassigned',
        assigned_to INTEGER REFERENCES employees(id),
        assigned_at TIMESTAMPTZ,
        assigned_by VARCHAR(100),
        assignment_method VARCHAR(30),
        accepted_at TIMESTAMPTZ,
        qualification JSONB DEFAULT '{}'::jsonb,
        budget JSONB DEFAULT '{}'::jsonb,
        requirements TEXT,
        insights TEXT,
        tags JSONB DEFAULT '[]'::jsonb,
        last_activity_at TIMESTAMPTZ,
        next_follow_up_at TIMESTAMPTZ,
        converted_at TIMESTAMPTZ,
        lost_at TIMESTAMPTZ,
        is_deleted BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    const leadAlters = [
      "tenant_id VARCHAR(50) DEFAULT 'default'",
      "country VARCHAR(100) DEFAULT 'India'",
      "source_meta JSONB DEFAULT '{}'::jsonb",
      "currency VARCHAR(10) DEFAULT 'INR'",
      "priority VARCHAR(20) DEFAULT 'medium'",
      "assignment_status VARCHAR(30) DEFAULT 'unassigned'",
      "assigned_to INTEGER",
      "assigned_at TIMESTAMPTZ",
      "assigned_by VARCHAR(100)",
      "assignment_method VARCHAR(30)",
      "accepted_at TIMESTAMPTZ",
      "qualification JSONB DEFAULT '{}'::jsonb",
      "budget JSONB DEFAULT '{}'::jsonb",
      "requirements TEXT",
      "insights TEXT",
      "tags JSONB DEFAULT '[]'::jsonb",
      "last_activity_at TIMESTAMPTZ",
      "next_follow_up_at TIMESTAMPTZ",
      "converted_at TIMESTAMPTZ",
      "lost_at TIMESTAMPTZ",
      "is_deleted BOOLEAN DEFAULT false",
      "updated_at TIMESTAMPTZ DEFAULT NOW()",
    ];
    for (const col of leadAlters) {
      await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ${col};`);
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS lead_assignment_queue (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(50) DEFAULT 'default',
        lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        status VARCHAR(30) DEFAULT 'queued',
        priority INTEGER DEFAULT 0,
        queued_at TIMESTAMPTZ DEFAULT NOW(),
        processed_at TIMESTAMPTZ,
        failure_reason TEXT,
        attempts INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS assignment_history (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(50) DEFAULT 'default',
        lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        from_employee_id INTEGER REFERENCES employees(id),
        to_employee_id INTEGER REFERENCES employees(id),
        method VARCHAR(30) NOT NULL,
        performed_by VARCHAR(100),
        reason TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS assignment_config (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(50) UNIQUE DEFAULT 'default',
        mode VARCHAR(30) DEFAULT 'round_robin',
        auto_assign BOOLEAN DEFAULT true,
        round_robin_order JSONB DEFAULT '[]'::jsonb,
        rr_index INTEGER DEFAULT 0,
        paused_employees JSONB DEFAULT '[]'::jsonb,
        workload_rules JSONB DEFAULT '{}'::jsonb,
        today_key VARCHAR(10),
        today_stats JSONB DEFAULT '{"total":0,"byEmployee":{}}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS lead_timeline_events (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(50) DEFAULT 'default',
        lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        actor_id VARCHAR(100),
        actor_name VARCHAR(255),
        actor_role VARCHAR(50),
        summary TEXT,
        payload JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS crm_notifications (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(50) DEFAULT 'default',
        user_id VARCHAR(100),
        employee_id INTEGER REFERENCES employees(id),
        type VARCHAR(50),
        title VARCHAR(255),
        body TEXT,
        entity_type VARCHAR(50),
        entity_id VARCHAR(100),
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(50) DEFAULT 'default',
        actor_id VARCHAR(100),
        action VARCHAR(100),
        resource VARCHAR(50),
        resource_id VARCHAR(100),
        before_state JSONB,
        after_state JSONB,
        ip VARCHAR(50),
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS lead_notes (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(50) DEFAULT 'default',
        lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        author_id VARCHAR(100),
        author_type VARCHAR(20) DEFAULT 'employee',
        body TEXT NOT NULL,
        is_pinned BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS employee_calls (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(50) DEFAULT 'default',
        lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        employee_id INTEGER NOT NULL REFERENCES employees(id),
        direction VARCHAR(20) DEFAULT 'outbound',
        outcome VARCHAR(100),
        duration_sec INTEGER,
        started_at TIMESTAMPTZ,
        ended_at TIMESTAMPTZ,
        sop_id INTEGER REFERENCES sops(id),
        checklist_progress JSONB DEFAULT '[]'::jsonb,
        recording_url TEXT,
        transcript TEXT,
        notes TEXT,
        ai_summary TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS followups (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(50) DEFAULT 'default',
        lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        employee_id INTEGER NOT NULL REFERENCES employees(id),
        task_id INTEGER,
        scheduled_at TIMESTAMPTZ NOT NULL,
        note TEXT,
        status VARCHAR(30) DEFAULT 'pending',
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS meetings (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(50) DEFAULT 'default',
        lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        employee_id INTEGER NOT NULL REFERENCES employees(id),
        title VARCHAR(255),
        scheduled_at TIMESTAMPTZ NOT NULL,
        duration_min INTEGER,
        meet_link TEXT,
        location TEXT,
        status VARCHAR(30) DEFAULT 'scheduled',
        mom JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(50) DEFAULT 'default',
        assignee_id INTEGER NOT NULL REFERENCES employees(id),
        lead_id INTEGER REFERENCES leads(id),
        follow_up_id INTEGER,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        priority VARCHAR(20) DEFAULT 'medium',
        due_at TIMESTAMPTZ,
        status VARCHAR(30) DEFAULT 'pending',
        sop_checklist JSONB DEFAULT '[]'::jsonb,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS file_assets (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(50) DEFAULT 'default',
        uploaded_by VARCHAR(100),
        entity_type VARCHAR(50),
        entity_id VARCHAR(100),
        filename VARCHAR(255),
        original_name VARCHAR(255),
        mime VARCHAR(100),
        size INTEGER,
        storage_key TEXT,
        url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_leads_tenant_assignment ON leads(tenant_id, assignment_status, created_at DESC);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_leads_tenant_assigned ON leads(tenant_id, assigned_to, pipeline_stage);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_lead_queue_status ON lead_assignment_queue(tenant_id, status, priority DESC, queued_at);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_timeline_lead ON lead_timeline_events(tenant_id, lead_id, created_at DESC);
    `);

    console.log("Database tables ready (PostgreSQL operational schema)");
    await seedOperationalData(pool);
  } catch (error) {
    console.error("Database init error:", error.message || error);
    throw error;
  }
}

async function seedOperationalData(pool) {
  const employeeRows = [
    { name: "Amit Kumar", email: "amit.kumar@techsales.in", role: "Sales Manager", department: "Sales", initials: "AK" },
    { name: "Priya Sharma", email: "priya.sharma@techsales.in", role: "Sales Executive", department: "Sales", initials: "PS" },
    { name: "Rohan Verma", email: "rohan.verma@techsales.in", role: "Sales Executive", department: "Sales", initials: "RV" },
    { name: "Neha Patel", email: "neha.patel@techsales.in", role: "Sales Executive", department: "Sales", initials: "NP" },
  ];

  const employeeIds = {};
  for (const emp of employeeRows) {
    const existing = await pool.query(
      `SELECT id FROM employees WHERE tenant_id = 'default' AND email = $1 LIMIT 1`,
      [emp.email],
    );
    if (existing.rows[0]) {
      employeeIds[emp.name] = existing.rows[0].id;
      continue;
    }
    const inserted = await pool.query(
      `INSERT INTO employees (name, email, role, department, status, tenant_id, initials, current_active_leads)
       VALUES ($1, $2, $3, $4, 'active', 'default', $5, 0)
       RETURNING id`,
      [emp.name, emp.email, emp.role, emp.department, emp.initials],
    );
    employeeIds[emp.name] = inserted.rows[0].id;
  }

  const leadCount = await pool.query(`SELECT COUNT(*)::int AS c FROM leads WHERE tenant_id = 'default' AND is_deleted = false`);
  if (leadCount.rows[0]?.c > 0) return;

  const amitId = employeeIds["Amit Kumar"];
  const priyaId = employeeIds["Priya Sharma"];
  const rohanId = employeeIds["Rohan Verma"];

  const leads = [
    { name: "Rajesh Mehta", company: "Tech Corp India", temp: "Hot Lead", stage: "Proposal Sent", status: "Proposal Sent", source: "LinkedIn", revenue: 800000, service: "AI Automation Suite", assignee: amitId },
    { name: "Priya Sharma", company: "InfoSystems Ltd", temp: "Hot Lead", stage: "Converted", status: "Converted", source: "Referral", revenue: 1200000, service: "CRM Setup & Onboarding", assignee: priyaId },
    { name: "Suresh Jain", company: "BuildNext Pvt", temp: "Warm Lead", stage: "Attempted", status: "Attempted", source: "Facebook", revenue: 300000, service: "Lead Gen Engine", assignee: amitId },
    { name: "Kavitha Nair", company: "EduTech Hub", temp: "Warm Lead", stage: "Call Booked", status: "Call Booked", source: "Website", revenue: 600000, service: "Strategic Consulting", assignee: priyaId },
    { name: "Deepak Singh", company: "RetailMax", temp: "Cold Lead", stage: "Attempted", status: "Attempted", source: "Cold Call", revenue: 400000, service: "Custom Software Dev", assignee: amitId },
    { name: "Anjali Gupta", company: "MediCare Plus", temp: "Hot Lead", stage: "Negotiation", status: "Negotiation", source: "Exhibition", revenue: 1500000, service: "AI Automation Suite", assignee: priyaId },
    { name: "Meena Pillai", company: "FinServe India", temp: "Hot Lead", stage: "Proposal Sent", status: "Proposal Sent", source: "Referral", revenue: 2000000, service: "CRM Setup & Onboarding", assignee: amitId },
    { name: "Arun Kumar", company: "LogiTrans", temp: "Warm Lead", stage: "Call Booked", status: "Call Booked", source: "Website", revenue: 500000, service: "Lead Gen Engine", assignee: amitId },
    { name: "Sneha Verma", company: "FoodChain", temp: "Cold Lead", stage: "Attempted", status: "Attempted", source: "Facebook", revenue: 100000, service: "Strategic Consulting", assignee: amitId },
    { name: "Vikram Rao", company: "SmartHome Co", temp: "Cold Lead", stage: "Not Pick", status: "Not Pick", source: "LinkedIn", revenue: 200000, service: "Custom Software Dev", assignee: amitId },
    { name: "Ritu Arora", company: "MediaPlus", temp: "Cold Lead", stage: "Closed", status: "Not Interested", source: "Instagram", revenue: 300000, service: "AI Automation Suite", assignee: rohanId },
    { name: "Siddharth Roy", company: "DataPro Pvt", temp: "Cold Lead", stage: "Closed", status: "Not Interested", source: "Cold Call", revenue: 200000, service: "CRM Setup & Onboarding", assignee: rohanId },
  ];

  for (const lead of leads) {
    await pool.query(
      `INSERT INTO leads (
        lead_name, company_name, phone, email, city, source, temperature, pipeline_stage, status,
        expected_revenue, requirements, tenant_id, assignment_status, assigned_to, assigned_at,
        assigned_by, assignment_method, last_activity_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, 'Mumbai', $5, $6, $7, $8,
        $9, $10, 'default', 'assigned', $11, NOW(),
        'seed', 'manual', NOW(), NOW(), NOW()
      )`,
      [
        lead.name,
        lead.company,
        "+91 90000" + String(Math.floor(Math.random() * 90000)).padStart(5, "0"),
        lead.name.toLowerCase().replace(/\s+/g, ".") + "@example.com",
        lead.source,
        lead.temp,
        lead.stage,
        lead.status,
        lead.revenue,
        lead.service,
        lead.assignee,
      ],
    );
  }

  if (amitId) {
    await pool.query(
      `UPDATE employees SET current_active_leads = (
        SELECT COUNT(*) FROM leads WHERE assigned_to = $1 AND is_deleted = false
      ) WHERE id = $1`,
      [amitId],
    );
  }

  console.log("Seeded demo employees and leads with assignments");
}

module.exports = { initDatabase };
