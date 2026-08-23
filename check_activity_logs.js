require('dotenv').config();
const pool = require('./config/db');

(async () => {
  console.log('\n=== ALL ACTIVITY LOGS IN DB ===');
  const res = await pool.query('SELECT * FROM activity_logs ORDER BY id DESC LIMIT 20');
  console.log(res.rows || res[0]);

  await pool.end();
})().catch(e => console.error(e));
