const express = require("express");
const cors = require("cors");
const { pool } = require("./db");

const multer = require("multer");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

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

// POST /ingest/pano-file (multipart)
app.post("/ingest/pano-file", upload.single("file"), async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ ok: false, error: "Missing file" });

    const { property_id, level, lat, lon, heading_deg, faces_json } =
      req.body || {};
    const toNumOrNull = (v) => {
      if (v === undefined || v === null) return null;
      const s = String(v).trim().toLowerCase();
      if (s === "" || s === "null" || s === "undefined" || s === "nan")
        return null;
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    };
    const toIntOrNull = (v) => {
      const n = toNumOrNull(v);
      return n === null ? null : Math.trunc(n);
    };
    let faces = {};
    if (faces_json) {
      try {
        faces = JSON.parse(faces_json);
      } catch {
        faces = {};
      }
    }

    const q = `
      INSERT INTO panoramas
        (property_id, level, lat, lon, heading_deg, captured_at, faces_json,
         image, image_content_type, image_byte_length)
      VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7,$8,$9)
      RETURNING id
    `;
    const params = [
      toIntOrNull(property_id),
      level || null,
      toNumOrNull(lat),
      toNumOrNull(lon),
      toNumOrNull(heading_deg),
      faces,
      req.file.buffer,
      req.file.mimetype || null,
      req.file.size ?? null,
    ];
    const { rows } = await pool.query(q, params);
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

// app.get("/pano/:id/image", async (req, res) => {
//   try {
//     const { rows } = await pool.query(
//       "SELECT image, image_content_type FROM panoramas WHERE id = $1",
//       [req.params.id]
//     );
//     if (rows.length === 0 || !rows[0].image)
//       return res.status(404).send("Not found");
//     if (rows[0].image_content_type)
//       res.set("Content-Type", rows[0].image_content_type);
//     res.send(rows[0].image);
//   } catch {
//     res.status(500).send("Server error");
//   }
// });

// stream the original image stored in panoramas.image
app.get("/pano/:id/image", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT image, image_content_type FROM panoramas WHERE id = $1",
      [req.params.id]
    );
    if (rows.length === 0 || !rows[0].image)
      return res.status(404).send("Not found");
    if (rows[0].image_content_type)
      res.set("Content-Type", rows[0].image_content_type);
    // (optional) long cache since content is immutable post-ingest
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    res.send(rows[0].image);
  } catch (e) {
    res.status(500).send("Server error");
  }
});

const port = process.env.API_PORT || 5000;
app.listen(port, () => console.log(`Backend on :${port}`));
