require("dotenv").config({ quiet: true });
const pool = require("./config/db");

async function checkRevenueSeries() {
  try {
    const res = await pool.query(`
      SELECT 
        DATE_FORMAT(c.m_date, '%Y-%m') AS month_key,
        DATE_FORMAT(c.m_date, '%b') AS month,
        COALESCE(SUM(c.rev), 0) AS revenue,
        COALESCE(SUM(c.cash), 0) AS cash_collected,
        COALESCE(SUM(c.closed_count), 0) AS closed_count
       FROM (
         SELECT l.created_at AS m_date, 
           CASE WHEN LOWER(COALESCE(l.status, '')) IN ('converted', 'won', 'closed won', 'deal won', 'closed') THEN l.expected_revenue ELSE 0 END AS rev,
           0 AS cash,
           CASE WHEN LOWER(COALESCE(l.status, '')) IN ('converted', 'won', 'closed won', 'deal won', 'closed') THEN 1 ELSE 0 END AS closed_count
         FROM leads l
         WHERE l.is_deleted = 0 
       ) c
       GROUP BY DATE_FORMAT(c.m_date, '%Y-%m'), DATE_FORMAT(c.m_date, '%b')
       ORDER BY DATE_FORMAT(c.m_date, '%Y-%m')
    `);
    console.log("DB Revenue Rows:", res.rows);
  } catch (err) {
    console.error("DB Error:", err);
  } finally {
    process.exit(0);
  }
}

checkRevenueSeries();
