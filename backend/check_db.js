const { pool } = require('./db');

async function check() {
  try {
    const res = await pool.query('SELECT count(*) FROM panoramas');
    console.log('Panoramas count:', res.rows[0].count);
    
    if (res.rows[0].count > 0) {
      const first = await pool.query('SELECT id FROM panoramas LIMIT 1');
      console.log('First pano ID:', first.rows[0].id);
    }
  } catch (e) {
    console.error('Error:', e);
  } finally {
    pool.end();
  }
}

check();
