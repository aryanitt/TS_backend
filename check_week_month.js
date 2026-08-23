require('dotenv').config();
const mysql = require('mysql2/promise');
const { buildPeriodDateFilter } = require('./src/utils/periodFilter');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  async function testLeaderboard(period) {
    const leadFilter = buildPeriodDateFilter({ period, column: 'l.created_at' });
    const callFilter = buildPeriodDateFilter({ period, column: 'COALESCE(ec.started_at, ec.created_at)' });
    const meetingFilter = buildPeriodDateFilter({ period, column: 'COALESCE(m.scheduled_at, m.created_at)' });

    const [rows] = await conn.query(`
      SELECT 
        e.id, 
        e.name,
        COUNT(DISTINCT l.id) AS total_leads,
        COALESCE((
          SELECT COUNT(*) FROM employee_calls ec 
          WHERE ec.employee_id = e.id AND ${callFilter.clause} AND (ec.duration_sec > 0 OR LOWER(COALESCE(ec.outcome, '')) IN ('connected', 'picked_up', 'answered'))
        ), 0) AS pickup_calls,
        COALESCE((
          SELECT COUNT(*) FROM meetings m 
          WHERE m.employee_id = e.id AND ${meetingFilter.clause}
        ), 0) + SUM(CASE WHEN LOWER(COALESCE(l.pipeline_stage, '')) IN ('meeting booked', 'meeting done', 'booked') OR LOWER(COALESCE(l.status, '')) IN ('meeting booked', 'meeting done', 'booked') THEN 1 ELSE 0 END) AS meetings_booked,
        SUM(CASE WHEN LOWER(COALESCE(l.pipeline_stage, '')) LIKE '%proposal%' OR LOWER(COALESCE(l.status, '')) LIKE '%proposal%' THEN 1 ELSE 0 END) AS proposals_sent
       FROM employees e
       LEFT JOIN leads l ON l.assigned_to = e.id AND l.is_deleted = 0 AND ${leadFilter.clause}
       WHERE LOWER(COALESCE(e.status, 'active')) = 'active'
       GROUP BY e.id, e.name
       ORDER BY total_leads DESC, pickup_calls DESC
    `);
    return rows;
  }

  console.log('\n=== TODAY LEADERBOARD ===');
  console.log(await testLeaderboard('today'));

  console.log('\n=== THIS WEEK LEADERBOARD ===');
  console.log(await testLeaderboard('week'));

  console.log('\n=== THIS MONTH LEADERBOARD ===');
  console.log(await testLeaderboard('month'));

  await conn.end();
})().catch(e => console.error('ERROR:', e));
