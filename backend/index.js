const express = require("express");
const cors = require("cors");
const { pool } = require("./db");
const multer = require("multer");
const { exec } = require("child_process");
const http = require("http");

const ML_HOST = process.env.ML_HOST || "ml";
const ML_PORT = 5001;

function mlPost(path) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: ML_HOST, port: ML_PORT, path, method: "POST",
        headers: { "Content-Length": 0 } },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: data }); }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function mlGet(path) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: ML_HOST, port: ML_PORT, path }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    }).on("error", reject);
  });
}


const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

const app = express();
app.use(cors());
app.use(express.json());

// --- HELPERS ---
const toNum = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const num = Number(v);
  return isNaN(num) ? null : num;
};

const getFile = (req, key) => req.files?.[key]?.[0] ?? null;

// --- ROUTES ---
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

      const uploadedFiles = ["top", "bottom", "front", "back", "left", "right"]
        .map(key => getFile(req, key))
        .filter(Boolean);

      if (uploadedFiles.length === 0) {
        return res.status(400).json({ 
          ok: false, 
          error: "At least one face image is required" 
        });
      }
      
      const primaryFile = uploadedFiles[0];

      const facesJson = {
        faces: uploadedFiles.reduce((acc, file) => {
          acc[file.fieldname] = true;
          return acc;
        }, {}),
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
        getFile(req, "top")?.buffer ?? null,
        getFile(req, "bottom")?.buffer ?? null,
        getFile(req, "front")?.buffer ?? null,
        getFile(req, "back")?.buffer ?? null,
        getFile(req, "left")?.buffer ?? null,
        getFile(req, "right")?.buffer ?? null,
        primaryFile.mimetype || "image/jpeg",
        primaryFile.size ?? null,
      ];

      const { rows } = await pool.query(q, params);
      res.json({ ok: true, pano_id: rows[0].id });
    } catch (e) {
      console.error("Upload error:", e);
      res.status(400).json({ ok: false, error: e.message });
    }
  }
);

app.get("/panoramas", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, property_id, level, captured_at FROM panoramas ORDER BY captured_at DESC"
    );
    res.json(rows);
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.get("/detections", async (req, res) => {
  const { pano_id } = req.query;
  try {
    const { rows } = await pool.query(
      `SELECT d.*, 
              r.action as review_action,
              r.created_at as review_created_at
       FROM detections d
       LEFT JOIN LATERAL (
         SELECT action, created_at
         FROM reviews
         WHERE detection_id = d.id
         ORDER BY created_at DESC
         LIMIT 1
       ) r ON true
       WHERE d.pano_id = $1 
       ORDER BY d.created_at DESC`,
      [pano_id]
    );
    res.json(rows);
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

const VALID_IFC_CLASSES = new Set([
  "ifcDoor", "ifcSign", "ifcWall", "ifcFurniture", "ifcLightFixture",
  "ifcAirTerminal", "ifcComputer", "ifcSwitchingDevice", "ifcSensor",
  "ifcWindow", "ifcAudioVisualAppliance", "ifcElectricalOutlet",
  "ifcSanitaryTerminal", "ifcEquipmentElement", "ifcFurnishingElement",
  "ifcDuctSegment", "ifcController",
]);

app.post("/detection/:id/class", async (req, res) => {
  const id = Number(req.params.id);
  const { ifc_class } = req.body || {};

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ ok: false, error: "Invalid detection id" });
  }
  if (!ifc_class || !VALID_IFC_CLASSES.has(ifc_class)) {
    return res.status(400).json({ ok: false, error: "Invalid IFC class" });
  }

  const label_display = "IFC " + ifc_class
    .replace(/^ifc/, "")
    .replace(/([A-Z])/g, " $1")
    .trim();

  try {
    const { rows } = await pool.query(
      "UPDATE detections SET ifc_class = $2, label_display = $3 WHERE id = $1 RETURNING *",
      [id, ifc_class, label_display]
    );
    if (!rows.length) {
      return res.status(404).json({ ok: false, error: "Detection not found" });
    }
    res.json({ ok: true, detection: rows[0] });
  } catch (e) {
    console.error("Update class error:", e);
    res.status(400).json({ ok: false, error: e.message });
  }
});

// Update normalized bounding box for a single detection
app.post("/detection/:id/bbox", async (req, res) => {
  const id = Number(req.params.id);
  const { bbox_xywh } = req.body || {};

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ ok: false, error: "Invalid detection id" });
  }

  if (!Array.isArray(bbox_xywh) || bbox_xywh.length !== 4) {
    return res
      .status(400)
      .json({ ok: false, error: "bbox_xywh must be an array of four numbers" });
  }

  try {
    const cleaned = bbox_xywh.map((v) => {
      const num = Number(v);
      if (!Number.isFinite(num)) {
        throw new Error("bbox values must be finite numbers");
      }
      // clamp to [0, 1] since these are normalized coordinates
      return Math.max(0, Math.min(1, num));
    });

    const { rows } = await pool.query(
      "UPDATE detections SET bbox_xywh = $2 WHERE id = $1 RETURNING *",
      [id, cleaned]
    );

    if (!rows.length) {
      return res.status(404).json({ ok: false, error: "Detection not found" });
    }

    res.json({ ok: true, detection: rows[0] });
  } catch (e) {
    console.error("Update bbox error:", e);
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
    // 1. Record the review
    await pool.query(
      `INSERT INTO reviews (detection_id, reviewer, action, new_class, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [detection_id, "student", action, new_class || null, note || null]
    );

    // 2. If confirmed, create asset (if not already exists)
    if (action === 'confirm') {
      // Check if asset already exists for this detection
      const { rows: existing } = await pool.query(
        "SELECT id FROM assets WHERE $1 = ANY(source_detection_ids)",
        [detection_id]
      );

      if (existing.length === 0) {
        // Fetch detection and panorama details
        const { rows: dets } = await pool.query(
          `SELECT d.*, p.property_id, p.lat, p.lon, p.alt
           FROM detections d
           JOIN panoramas p ON d.pano_id = p.id
           WHERE d.id = $1`,
          [detection_id]
        );

        if (dets.length > 0) {
          const det = dets[0];
          
          // Create geometry
          let geometry = null;
          if (det.lat !== null && det.lon !== null) {
            geometry = {
              type: "Point",
              coordinates: [det.lon, det.lat, det.alt || 0]
            };
          }

          // Insert asset
          await pool.query(
            `INSERT INTO assets (
              property_id, ifc_class, status, source_detection_ids, attributes_json, geometry
            ) VALUES (
              $1, $2, 'confirmed', ARRAY[$3]::int[], $4, ST_GeomFromGeoJSON($5)
            )`,
            [
              det.property_id,
              new_class || det.ifc_class,
              det.id,
              JSON.stringify({
                confidence: det.confidence,
                face_id: det.face_id,
                bbox_xywh: det.bbox_xywh,
                model_version: det.model_version,
                ...(det.sphere_coords_json || {}),
              }),
              geometry ? JSON.stringify(geometry) : null
            ]
          );
        }
      }
    }

    res.json({ ok: true });
  } catch (e) {
    console.error("Review error:", e);
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
            model_version: detection.model_version,
            ...(detection.sphere_coords_json || {}),
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

app.post("/ml/retrain", async (req, res) => {
  try {
    const { status, body } = await mlPost("/retrain");
    res.status(status).json(body);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/ml/retrain/status", async (req, res) => {
  try {
    const { status, body } = await mlGet("/retrain/status");
    res.status(status).json(body);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/ml/export-dataset", async (req, res) => {
  try {
    console.log("Starting dataset export...");

    exec(
      "docker exec ifc_ml python /app/export_database.py",
      (error, stdout, stderr) => {

        if (error) {
          console.error("Export error:", error);
          return res.status(500).json({
            ok: false,
            error: stderr || error.message
          });
        }

        console.log("Export output:", stdout);

        res.json({
          ok: true,
          message: "Dataset exported successfully",
          output: stdout
        });
      }
    );

  } catch (e) {
    console.error("Export endpoint error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});


const port = process.env.PORT || process.env.API_PORT || 5000;
if (require.main === module) {
  app.listen(port, () => console.log(`Backend on :${port}`));
}

module.exports = app;
