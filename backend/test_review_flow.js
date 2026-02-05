const { pool } = require("./db");
const http = require("http");

function postReview(data) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: '/review',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(JSON.parse(body)));
    });
    req.on('error', reject);
    req.write(JSON.stringify(data));
    req.end();
  });
}

async function run() {
  try {
    // 1. Get a detection
    const { rows: detections } = await pool.query("SELECT * FROM detections LIMIT 1");
    if (detections.length === 0) {
      console.log("No detections found. Cannot test review flow.");
      process.exit(0);
    }
    const detectionId = detections[0].id;
    console.log(`Testing with detection ID: ${detectionId}`);

    // 2. Send review
    console.log("Sending review request...");
    const reviewRes = await postReview({
      detection_id: detectionId,
      action: 'confirm',
      note: 'Automated test review'
    });
    console.log("Review response:", reviewRes);

    // 3. Check assets
    const { rows: assets } = await pool.query("SELECT * FROM assets WHERE $1 = ANY(source_detection_ids)", [detectionId]);
    if (assets.length > 0) {
      console.log("SUCCESS: Asset created!", assets[0]);
    } else {
      console.log("FAILURE: Asset not created.");
    }

  } catch (e) {
    console.error("Error:", e);
  } finally {
    pool.end();
  }
}

run();
