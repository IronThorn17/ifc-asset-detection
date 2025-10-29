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

app.post(
  "/ingest/pano-set",
  upload.fields([
    { name: "top", maxCount: 1 },
    { name: "bottom", maxCount: 1 },
    { name: "front", maxCount: 1 },
    { name: "back", maxCount: 1 },
    { name: "left", maxCount: 1 },
    { name: "right", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { property_id, level, lat, lon, alt, timestamp, area } = req.body || {};
      const toNum = (v) => {
        if (v === undefined || v === null || v === "") return null;
        const num = Number(v);
        return isNaN(num) ? null : num;
      };

      const faces = {};
      const getFile = (key) => req.files?.[key]?.[0] ?? null;
      for (const k of ["top", "bottom", "front", "back", "left", "right"]) {
        if (getFile(k)) faces[k] = true;
      }

      const facesJson = {
        faces,
        meta: {
          lat: toNum(lat),
          lon: toNum(lon),
          alt: toNum(alt),
          area: toNum(area),
          timestamp: timestamp ? new Date(timestamp).toISOString() : null,
          property_id: property_id ? Number(property_id) : null,
          level: level || null,
        },
      };

      // Check if at least one file is present
      const uploadedFiles = [];
      for (const k of ["top", "bottom", "front", "back", "left", "right"]) {
        if (getFile(k)) uploadedFiles.push(k);
      }
      
      if (uploadedFiles.length === 0) {
        return res.status(400).json({ 
          ok: false, 
          error: "At least one face image is required" 
        });
      }

      const q = `
        INSERT INTO panoramas
          (property_id, level, lat, lon, alt, captured_at, faces_json,
           img_top, img_bottom, img_front, img_back, img_left, img_right,
           image_content_type, image_byte_length)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        RETURNING id
      `;

      const params = [
        property_id ? Number(property_id) : null,
        level || null,
        toNum(lat),
        toNum(lon),
        toNum(alt),
        timestamp ? new Date(timestamp) : new Date(),
        facesJson,
        getFile("top")?.buffer ?? null,
        getFile("bottom")?.buffer ?? null,
        getFile("front")?.buffer ?? null,
        getFile("back")?.buffer ?? null,
        getFile("left")?.buffer ?? null,
        getFile("right")?.buffer ?? null,
        getFile("front")?.mimetype || "image/jpeg", // store one common type
        getFile("front")?.size ?? null,
      ];

      const { rows } = await pool.query(q, params);
      res.json({ ok: true, pano_id: rows[0].id });
    } catch (e) {
      console.error("Upload error:", e);
      res.status(400).json({ ok: false, error: e.message });
    }
  }
);

// // POST /ingest/pano-file (multipart)
// app.post("/ingest/pano-file", upload.single("file"), async (req, res) => {
//   try {
//     if (!req.file)
//       return res.status(400).json({ ok: false, error: "Missing file" });

//     const { property_id, level, lat, lon, heading_deg, faces_json } =
//       req.body || {};
//     const toNumOrNull = (v) => {
//       if (v === undefined || v === null) return null;
//       const s = String(v).trim().toLowerCase();
//       if (s === "" || s === "null" || s === "undefined" || s === "nan")
//         return null;
//       const n = Number(s);
//       return Number.isFinite(n) ? n : null;
//     };
//     const toIntOrNull = (v) => {
//       const n = toNumOrNull(v);
//       return n === null ? null : Math.trunc(n);
//     };
//     let faces = {};
//     if (faces_json) {
//       try {
//         faces = JSON.parse(faces_json);
//       } catch {
//         faces = {};
//       }
//     }

//     const q = `
//       INSERT INTO panoramas
//         (property_id, level, lat, lon, heading_deg, captured_at, faces_json,
//          image, image_content_type, image_byte_length)
//       VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7,$8,$9)
//       RETURNING id
//     `;
//     const params = [
//       toIntOrNull(property_id),
//       level || null,
//       toNumOrNull(lat),
//       toNumOrNull(lon),
//       toNumOrNull(heading_deg),
//       faces,
//       req.file.buffer,
//       req.file.mimetype || null,
//       req.file.size ?? null,
//     ];
//     const { rows } = await pool.query(q, params);
//     res.json({ ok: true, pano_id: rows[0].id });
//   } catch (e) {
//     res.status(400).json({ ok: false, error: e.message });
//   }
// });

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
//     // (optional) long cache since content is immutable post-ingest
//     res.set("Cache-Control", "public, max-age=31536000, immutable");
//     res.send(rows[0].image);
//   } catch (e) {
//     res.status(500).send("Server error");
//   }
// });

app.get("/pano/:id/image/:face", async (req, res) => {
  const { id, face } = req.params;
  if (!["top", "bottom", "front", "back", "left", "right"].includes(face))
    return res.status(400).send("Invalid face");

  const q = `SELECT img_${face} AS img, image_content_type FROM panoramas WHERE id=$1`;
  const { rows } = await pool.query(q, [id]);
  if (!rows.length || !rows[0].img) return res.status(404).send("Not found");

  res.set("Content-Type", rows[0].image_content_type || "image/jpeg");
  res.send(rows[0].img);
});

const port = process.env.API_PORT || 5000;
app.listen(port, () => console.log(`Backend on :${port}`));
