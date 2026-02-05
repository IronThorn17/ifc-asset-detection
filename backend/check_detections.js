const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function checkDetections() {
  try {
    const res = await pool.query(`
      SELECT model_version, COUNT(*) as count, MIN(created_at) as first_seen, MAX(created_at) as last_seen
      FROM detections
      GROUP BY model_version
    `);
    console.table(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

checkDetections();
