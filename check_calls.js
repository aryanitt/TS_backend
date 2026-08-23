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

  async function checkEmployeeCalls(period) {
    const callFilter = buildPeriodDateFilter({ period, column: 'COALESCE(ec.started_at, ec.created_at)' });
    const [rows] = await conn.query(`
      SELECT 
        e.id, 
        e.name,
        COUNT(ec.id) AS total_calls,
        SUM(CASE WHEN ec.duration_sec > 0 OR LOWER(COALESCE(ec.outcome, '')) IN ('connected', 'picked_up', 'answered') THEN 1 ELSE 0 END) AS connected_calls
       FROM employees e
       LEFT JOIN employee_calls ec ON ec.employee_id = e.id AND ${callFilter.clause}
       WHERE LOWER(COALESCE(e.status, 'active')) = 'active'
       GROUP BY e.id, e.name
       ORDER BY total_calls DESC
    `);
    return rows;
  }

  console.log('--- TODAY ---', await checkEmployeeCalls('today'));
  console.log('--- WEEK ---', await checkEmployeeCalls('week'));
  console.log('--- MONTH ---', await checkEmployeeCalls('month'));

  await conn.end();
})().catch(e => console.error(e));
