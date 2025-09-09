const express = require("express");
const cors = require("cors");
const { pool } = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_, res) => res.json({ ok: true }));
app.get("/health/db", async (_, res) => {
  try {
    const r = await pool.query("SELECT NOW() AS now");
    res.json({ ok: true, now: r.rows[0].now });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/ingest/pano", async (req, res) => {
  const { property_id, level, lat, lon, heading_deg, faces_json, storage_uri } =
    req.body || {};
  try {
    const q = `
      INSERT INTO panoramas (property_id, level, lat, lon, heading_deg, captured_at, faces_json, storage_uri)
      VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7) RETURNING id
    `;
    const { rows } = await pool.query(q, [
      property_id,
      level,
      lat,
      lon,
      heading_deg,
      faces_json || {},
      storage_uri || null,
    ]);
    res.json({ ok: true, pano_id: rows[0].id });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.get("/detections", async (req, res) => {
  const { pano_id } = req.query;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM detections WHERE pano_id = $1 ORDER BY created_at DESC`,
      [pano_id]
    );
    res.json(rows);
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.post("/review", async (req, res) => {
  const { detection_id, action, new_class, note } = req.body || {};
  try {
    await pool.query(
      `INSERT INTO reviews (detection_id, reviewer, action, new_class, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [detection_id, "student", action, new_class || null, note || null]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

const port = process.env.API_PORT || 5000;
app.listen(port, () => console.log(`Backend on :${port}`));
