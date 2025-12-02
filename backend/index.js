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
      `SELECT d.*, 
              r.action as review_action,
              r.created_at as review_created_at
       FROM detections d
       LEFT JOIN reviews r ON d.id = r.detection_id
       WHERE d.pano_id = $1 
       ORDER BY d.created_at DESC`,
      [pano_id]
    );
    res.json(rows);
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.get("/assets", async (req, res) => {
  const { property_id } = req.query;
  try {
    let query = `
      SELECT a.*, p.name as property_name
      FROM assets a
      LEFT JOIN properties p ON a.property_id = p.id
    `;
    const params = [];
    
    if (property_id) {
      query += " WHERE a.property_id = $1";
      params.push(property_id);
    }
    
    query += " ORDER BY a.created_at DESC";
    
    const { rows } = await pool.query(query, params);
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

app.post("/convert-to-assets", async (req, res) => {
  const { pano_id } = req.body || {};
  try {
    // Get all confirmed detections for this panorama
    const { rows: detections } = await pool.query(
      `SELECT d.*, r.action as review_action
       FROM detections d
       LEFT JOIN reviews r ON d.id = r.detection_id
       WHERE d.pano_id = $1 AND r.action = 'confirm'
       ORDER BY d.created_at DESC`,
      [pano_id]
    );

    if (detections.length === 0) {
      return res.status(400).json({ ok: false, error: "No confirmed detections found for this panorama" });
    }

    // Get the property_id from the panorama
    const { rows: panoramaRows } = await pool.query(
      "SELECT id, property_id, lat, lon, alt FROM panoramas WHERE id = $1",
      [pano_id]
    );

    if (panoramaRows.length === 0) {
      return res.status(400).json({ ok: false, error: "Panorama not found" });
    }

    const { property_id, lat, lon, alt } = panoramaRows[0];

    // Convert each confirmed detection to an asset
    const assetIds = [];
    for (const detection of detections) {
      // Create a basic point geometry from panorama coordinates
      let geometry = null;
      if (lat !== null && lon !== null) {
        geometry = {
          type: "Point",
          coordinates: [lon, lat, alt || 0]
        };
      }

      const { rows: assetRows } = await pool.query(
        `INSERT INTO assets (
          property_id, ifc_class, status, source_detection_ids, attributes_json, geometry
        ) VALUES (
          $1, $2, 'confirmed', ARRAY[$3], $4, ST_GeomFromGeoJSON($5)
        ) RETURNING id`,
        [
          property_id,
          detection.ifc_class,
          detection.id,
          JSON.stringify({
            confidence: detection.confidence,
            face_id: detection.face_id,
            bbox_xywh: detection.bbox_xywh,
            model_version: detection.model_version
          }),
          geometry ? JSON.stringify(geometry) : null
        ]
      );
      assetIds.push(assetRows[0].id);
    }

    res.json({ 
      ok: true, 
      message: `Converted ${detections.length} detections to assets`,
      asset_ids: assetIds
    });
  } catch (e) {
    console.error("Convert to assets error:", e);
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.get("/pano/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      "SELECT * FROM panoramas WHERE id = $1",
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: "Panorama not found" });
    }
    res.json(rows[0]);
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.get("/pano/:id/image/:face", async (req, res) => {
  try {
    const { id, face } = req.params;
    if (!["top", "bottom", "front", "back", "left", "right"].includes(face))
      return res.status(400).send("Invalid face");

    const q = `SELECT img_${face} AS img, image_content_type FROM panoramas WHERE id=$1`;
    const { rows } = await pool.query(q, [id]);
    if (!rows.length || !rows[0].img) return res.status(404).send("Not found");

    res.set("Content-Type", rows[0].image_content_type || "image/jpeg");
    res.send(rows[0].img);
  } catch (e) {
    console.error("Error fetching panorama image:", e);
    res.status(500).send("Server error");
  }
});

const port = process.env.PORT || process.env.API_PORT || 5000;
app.listen(port, () => console.log(`Backend on :${port}`));
