require("dotenv").config({ override: true });
const express = require("express");
const cors = require("cors");
const { pool } = require("./db");
const multer = require("multer");
const { exec } = require("child_process");
const http = require("http");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
// AWS S3 Setup
const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const s3Client = process.env.AWS_S3_BUCKET ? new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
}) : null;

const ML_HOST = process.env.ML_HOST || "ml";
const ML_PORT = 5001;
const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret_for_dev_only";

// --- MIDDLEWARE ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Forbidden" });
    req.user = user;
    next();
  });
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});
const uploadPanoSet = upload.fields([
  { name: "top", maxCount: 1 },
  { name: "bottom", maxCount: 1 },
  { name: "front", maxCount: 1 },
  { name: "back", maxCount: 1 },
  { name: "left", maxCount: 1 },
  { name: "right", maxCount: 1 },
]);

const app = express();
app.use(cors());
app.use(express.json());

// --- HELPERS ---
function mlPost(path) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: ML_HOST, port: ML_PORT, path, method: "POST", headers: { "Content-Length": 0 } },
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

const toNum = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const num = Number(v);
  return isNaN(num) ? null : num;
};

// --- AUTH ROUTES ---
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (username === "admin" && password === "admin123") {
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '24h' });
    return res.json({ token, username });
  }
  res.status(401).json({ error: "Invalid credentials" });
});

// --- API ROUTES ---
app.get("/health", (_, res) => res.json({ ok: true }));

app.post("/ingest/pano-file", authenticateToken, upload.single("file"), async (req, res) => {
  try {
    const { property_id, level, lat, lon, alt, faces } = req.body;
    const file = req.file;
    let s3Key = null;

    if (file && process.env.AWS_S3_BUCKET) {
      const uuid = require('crypto').randomUUID();
      s3Key = `uploads/panoramas/image/${uuid}/tiles/f/mobile.jpg`;
      const { PutObjectCommand } = require("@aws-sdk/client-s3");
      await s3Client.send(new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: s3Key,
        Body: file.buffer,
        ContentType: file.mimetype
      }));
    }

    // Expanded query to support all faces (initializing others to null for now)
    const q = `
      INSERT INTO panoramas (
        property_id, level, lat, lon, alt, captured_at, faces_json, 
        img_top, img_bottom, img_front, img_back, img_left, img_right,
        image_content_type, image_byte_length, s3_key_front
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id
    `;

    const { rows } = await pool.query(q, [
      toNum(property_id), level, toNum(lat), toNum(lon), toNum(alt || 0), faces,
      null, null, s3Key ? null : file?.buffer, null, null, null,
      file?.mimetype || "image/jpeg", file?.size || 0, s3Key
    ]);

    res.json({ ok: true, pano_id: rows[0].id, s3_key: s3Key });
  } catch (e) {
    console.error("Upload error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/ingest/pano-set", authenticateToken, uploadPanoSet, async (req, res) => {
  try {
    const {
      property_id,
      level,
      lat,
      lon,
      alt,
      heading_deg,
      timestamp,
    } = req.body;

    const files = req.files || {};
    const top = files.top?.[0] || null;
    const bottom = files.bottom?.[0] || null;
    const front = files.front?.[0] || null;
    const back = files.back?.[0] || null;
    const left = files.left?.[0] || null;
    const right = files.right?.[0] || null;

    if (!front && !back) {
      return res.status(400).json({
        ok: false,
        error: "At least one of front/back images is required",
      });
    }

    const parsedCapturedAt = timestamp ? new Date(timestamp) : null;
    const capturedAt =
      parsedCapturedAt && !Number.isNaN(parsedCapturedAt.getTime())
        ? parsedCapturedAt
        : new Date();

    const faces = {
      top: Boolean(top),
      bottom: Boolean(bottom),
      front: Boolean(front),
      back: Boolean(back),
      left: Boolean(left),
      right: Boolean(right),
    };

    const faces_json = {
      faces,
      meta: {
        lat: toNum(lat),
        lon: toNum(lon),
        alt: toNum(alt || 0),
        timestamp: capturedAt.toISOString(),
        property_id: toNum(property_id),
        level: level || null,
      },
    };

    const imageByteLength = [top, bottom, front, back, left, right]
      .filter(Boolean)
      .reduce((sum, f) => sum + (f.size || 0), 0);

    const q = `
      INSERT INTO panoramas (
        property_id, level, lat, lon, alt, heading_deg, captured_at, faces_json,
        img_top, img_bottom, img_front, img_back, img_left, img_right,
        image_content_type, image_byte_length
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14,
        $15, $16
      )
      RETURNING id
    `;

    const { rows } = await pool.query(q, [
      toNum(property_id),
      level || null,
      toNum(lat),
      toNum(lon),
      toNum(alt || 0),
      toNum(heading_deg || 0),
      capturedAt,
      faces_json,
      top?.buffer || null,
      bottom?.buffer || null,
      front?.buffer || null,
      back?.buffer || null,
      left?.buffer || null,
      right?.buffer || null,
      "image/jpeg",
      imageByteLength,
    ]);

    res.json({ ok: true, pano_id: rows[0].id });
  } catch (e) {
    console.error("Pano set upload error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/panoramas", async (req, res) => {
  const { unreviewed } = req.query;
  try {
    let query = "SELECT id, property_id, level, captured_at FROM panoramas";
    if (unreviewed === "true") {
      query += ` WHERE EXISTS (
        SELECT 1 FROM detections d
        LEFT JOIN LATERAL (SELECT action FROM reviews r WHERE r.detection_id = d.id ORDER BY created_at DESC LIMIT 1) r ON true
        WHERE d.pano_id = panoramas.id AND r.action IS NULL
      )`;
    }
    const { rows } = await pool.query(query + " ORDER BY captured_at DESC");
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/detections", async (req, res) => {
  const { pano_id } = req.query;
  try {
    const { rows } = await pool.query(
      `SELECT d.*, r.action as review_action
       FROM detections d
       LEFT JOIN LATERAL (SELECT action FROM reviews WHERE detection_id = d.id ORDER BY created_at DESC LIMIT 1) r ON true
       WHERE d.pano_id = $1 ORDER BY d.created_at DESC`,
      [pano_id]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/pano/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT id, property_id, level, lat, lon, captured_at, faces_json, 
              (s3_key_top IS NOT NULL OR img_top IS NOT NULL) as img_top, 
              (s3_key_bottom IS NOT NULL OR img_bottom IS NOT NULL) as img_bottom, 
              (s3_key_front IS NOT NULL OR img_front IS NOT NULL) as img_front, 
              (s3_key_back IS NOT NULL OR img_back IS NOT NULL) as img_back, 
              (s3_key_left IS NOT NULL OR img_left IS NOT NULL) as img_left, 
              (s3_key_right IS NOT NULL OR img_right IS NOT NULL) as img_right 
       FROM panoramas WHERE id=$1`,
      [id]
    );
    if (!rows.length) return res.status(404).send("Not found");
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/pano/:id/image/:face", async (req, res) => {
  try {
    const { id, face } = req.params;
    const { rows } = await pool.query(`SELECT img_${face} AS img, s3_key_${face} AS s3_key, image_content_type FROM panoramas WHERE id=$1`, [id]);
    if (!rows.length) return res.status(404).send("Not found");

    if (rows[0].s3_key) {
      if (!s3Client) return res.status(500).send("S3 is not configured");

      const bucket = process.env.AWS_S3_BUCKET;
      const cmd = new GetObjectCommand({
        Bucket: bucket,
        Key: rows[0].s3_key,
      });

      try {
        const s3obj = await s3Client.send(cmd);
        res.set("Content-Type", s3obj.ContentType || rows[0].image_content_type || "image/jpeg");
        res.set("Cache-Control", "public, max-age=3600");
        if (s3obj.Body && typeof s3obj.Body.pipe === "function") {
          s3obj.Body.pipe(res);
          return;
        }
        const bytes = await s3obj.Body.transformToByteArray();
        return res.send(Buffer.from(bytes));
      } catch (err) {
        console.error("S3 getObject error:", err.message);
        return res.status(500).send("Failed to fetch image from S3");
      }
    }

    if (!rows[0].img) return res.status(404).send("Not found");
    res.set("Content-Type", rows[0].image_content_type || "image/jpeg");
    res.send(rows[0].img);
  } catch (e) {
    res.status(500).send("Server error");
  }
});

app.post("/detection/:id/class", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { ifc_class } = req.body;
  try {
    const label_display = "IFC " + ifc_class.replace(/^ifc/, "").replace(/([A-Z])/g, " $1").trim();
    const result = await pool.query(
      "UPDATE detections SET ifc_class = $1, label_display = $2 WHERE id = $3 RETURNING *",
      [ifc_class, label_display, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/detection/:id/bbox", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { bbox_xywh } = req.body;
  try {
    const result = await pool.query(
      "UPDATE detections SET bbox_xywh = $1 WHERE id = $2 RETURNING *",
      [bbox_xywh, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/review", authenticateToken, async (req, res) => {
  const { detection_id, action, new_class, note } = req.body;
  try {
    await pool.query(
      `INSERT INTO reviews (detection_id, reviewer, action, new_class, note) VALUES ($1, $2, $3, $4, $5)`,
      [detection_id, "admin", action, new_class || null, note || null]
    );
    if (action === "confirm") {
      const assetCheck = await pool.query("SELECT id FROM assets WHERE detection_id = $1", [detection_id]);
      if (assetCheck.rows.length === 0) {
        const detResult = await pool.query(
          "SELECT d.*, p.property_id, p.level, p.lat, p.lon, p.alt FROM detections d JOIN panoramas p ON d.pano_id = p.id WHERE d.id = $1",
          [detection_id]
        );
        if (detResult.rows.length > 0) {
          const d = detResult.rows[0];
          await pool.query(
            "INSERT INTO assets (property_id, level, ifc_class, label_display, lat, lon, alt, detection_id, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'confirmed')",
            [d.property_id, d.level, d.ifc_class, d.label_display, d.lat, d.lon, d.alt, d.id]
          );
        }
      }
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/assets", async (req, res) => {
  const { property_id } = req.query;
  try {
    let query = "SELECT a.*, p.name as property_name FROM assets a LEFT JOIN properties p ON a.property_id = p.id";
    const params = [];
    if (property_id) {
      query += " WHERE a.property_id = $1";
      params.push(property_id);
    }
    const { rows } = await pool.query(query + " ORDER BY a.created_at DESC", params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/ml/retrain", authenticateToken, async (req, res) => {
  try {
    const { status, body } = await mlPost("/retrain");
    res.status(status).json(body);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/ml/retrain/status", authenticateToken, async (req, res) => {
  try {
    const { status, body } = await mlGet("/retrain/status");
    res.status(status).json(body);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const port = process.env.PORT || 5000;
if (require.main === module) {
  app.listen(port, () => console.log(`Backend on :${port}`));
}
module.exports = app;
