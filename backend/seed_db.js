const { pool } = require('./db');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../Datasets/Images/train');
const PANO_PREFIX = '1185551';

async function seed() {
  try {
    console.log('Seeding database...');
    
    // Check if data exists
    const check = await pool.query('SELECT count(*) FROM panoramas');
    if (check.rows[0].count > 0) {
      console.log('Database already has data. Skipping seed.');
      return;
    }

    const faces = {
      front: path.join(DATA_DIR, `${PANO_PREFIX}_f.jpg`),
      back: path.join(DATA_DIR, `${PANO_PREFIX}_b.jpg`),
      left: path.join(DATA_DIR, `${PANO_PREFIX}_l.jpg`),
      right: path.join(DATA_DIR, `${PANO_PREFIX}_r.jpg`),
    };

    const buffers = {};
    const facesJson = { faces: {}, meta: { lat: 0, lon: 0, alt: 0 } };

    for (const [face, filePath] of Object.entries(faces)) {
      if (fs.existsSync(filePath)) {
        buffers[face] = fs.readFileSync(filePath);
        facesJson.faces[face] = true;
        console.log(`Loaded ${face} from ${filePath}`);
      } else {
        console.warn(`Missing file for ${face}: ${filePath}`);
      }
    }

    if (Object.keys(buffers).length === 0) {
      throw new Error('No images found to seed.');
    }

    // Insert property first
    let propertyId;
    const propCheck = await pool.query("SELECT id FROM properties WHERE name = 'Demo Property'");
    if (propCheck.rows.length > 0) {
      propertyId = propCheck.rows[0].id;
    } else {
      const propRes = await pool.query(
        "INSERT INTO properties (name, addr) VALUES ($1, $2) RETURNING id",
        ['Demo Property', '123 Test St']
      );
      propertyId = propRes.rows[0].id;
      console.log('Created property with ID:', propertyId);
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
      propertyId, // property_id
      'L1', // level
      0, 0, 0, // lat, lon, alt
      new Date(),
      facesJson,
      null, // top
      null, // bottom
      buffers.front || null,
      buffers.back || null,
      buffers.left || null,
      buffers.right || null,
      'image/jpeg',
      buffers.front ? buffers.front.length : 0
    ];

    const res = await pool.query(q, params);
    console.log(`Seeded panorama with ID: ${res.rows[0].id}`);

    // Add some dummy detections
    const detQ = `
      INSERT INTO detections (pano_id, face_id, bbox_xywh, confidence, ifc_class, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `;
    
    // Detection 1 (Front)
    await pool.query(detQ, [res.rows[0].id, 'front', [0.5, 0.5, 0.2, 0.2], 0.95, 'IfcDoor']);
    // Detection 2 (Left)
    await pool.query(detQ, [res.rows[0].id, 'left', [0.3, 0.4, 0.1, 0.3], 0.85, 'IfcWindow']);
    
    console.log('Seeded dummy detections.');

  } catch (e) {
    console.error('Seed error:', e);
  } finally {
    pool.end();
  }
}

seed();
