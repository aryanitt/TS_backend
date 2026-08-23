require('dotenv').config();
const mysql = require('mysql2/promise');

function formatINR(amount) {
  const v = Number(amount) || 0;
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(2)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${v.toLocaleString('en-IN')}`;
}

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const [rows] = await conn.query(`
    SELECT 
      e.id, 
      e.name,
      COUNT(DISTINCT l.id) AS total_leads,
      COALESCE((
        SELECT COUNT(*) FROM employee_calls ec 
        WHERE ec.employee_id = e.id AND (ec.duration_sec > 0 OR LOWER(COALESCE(ec.outcome, '')) IN ('connected', 'picked_up', 'answered'))
      ), 0) AS pickup_calls,
      COALESCE((
        SELECT COUNT(*) FROM meetings m WHERE m.employee_id = e.id
      ), 0) + SUM(CASE WHEN LOWER(COALESCE(l.pipeline_stage, '')) IN ('meeting booked', 'meeting done', 'booked') OR LOWER(COALESCE(l.status, '')) IN ('meeting booked', 'meeting done', 'booked') THEN 1 ELSE 0 END) AS meetings_booked,
      SUM(CASE WHEN LOWER(COALESCE(l.pipeline_stage, '')) LIKE '%proposal%' OR LOWER(COALESCE(l.status, '')) LIKE '%proposal%' THEN 1 ELSE 0 END) AS proposals_sent,
      COALESCE((
        SELECT SUM(cc.amount) FROM cash_collections cc WHERE cc.employee_id = e.id
      ), 0) + COALESCE(SUM(CASE WHEN LOWER(COALESCE(l.pipeline_stage, '')) IN ('closed won', 'converted', 'payment complete') OR LOWER(COALESCE(l.status, '')) IN ('closed won', 'converted', 'payment complete', 'advance received', 'paid') THEN COALESCE(l.expected_revenue, 0) ELSE 0 END), 0) AS advance_pay
     FROM employees e
     LEFT JOIN leads l ON l.assigned_to = e.id AND l.is_deleted = 0
     WHERE LOWER(COALESCE(e.status, 'active')) = 'active'
     GROUP BY e.id, e.name
     ORDER BY total_leads DESC, pickup_calls DESC, e.name ASC
     LIMIT 3
  `);

  const leaderboard = rows.map((r) => {
    const leads = Number(r.total_leads || r.leads) || 0;
    const pickup = Number(r.pickup_calls) || 0;
    const meetings = Number(r.meetings_booked) || 0;
    const proposals = Number(r.proposals_sent) || 0;
    const advancePay = Number(r.advance_pay) || 0;
    return {
      id: r.id,
      name: r.name,
      leads,
      pickup,
      meetings,
      proposals,
      advancePay: formatINR(advancePay),
      rawAdvancePay: advancePay,
    };
  });

  console.log('\n=== REAL LEADERBOARD PAYLOAD ===');
  console.log(JSON.stringify(leaderboard, null, 2));

  await conn.end();
})().catch(e => console.error('ERROR:', e));
