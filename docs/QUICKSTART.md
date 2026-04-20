# Quick Start

## Prerequisites

- Docker Desktop
- AWS credentials with S3 + RDS access (or use the local DB for dev)
- Git

---

## 1. Clone and Configure

```bash
git clone https://github.com/IronThorn17/ifc-asset-detection.git
cd ifc-asset-detection
cp .env.example .env
```

Edit `.env` and fill in:

```
DATABASE_URL=postgresql://user:pass@host:5432/ifc_assets
AWS_S3_BUCKET=your-bucket-name
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
JWT_SECRET=your-random-secret-32-chars-min
```

> For local-only development (no AWS), leave `AWS_S3_BUCKET` empty. Images will be stored as database blobs instead.

---

## 2. Start Services

```bash
docker compose up -d
```

This starts four containers: database, backend, frontend, and ML service.

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:5000 |
| Database | localhost:5432 |

---

## 3. Log In

Navigate to http://localhost:5173 and log in with the default credentials:

- **Username:** `admin`
- **Password:** `admin123`

> Change these credentials before any shared or production deployment.

---

## 4. Upload Panoramas

1. Click the **Upload** tab
2. Use **Bulk Upload** to select multiple image files, or **Image Set** to upload all 6 cubemap faces (front, back, left, right, top, bottom) with metadata
3. Required metadata: property ID, level/floor, latitude, longitude, heading in degrees

The ML service polls for unprocessed panoramas every 5 seconds. Detections will appear automatically.

---

## 5. Review Detections

1. Click the **Review** tab
2. Select a panorama from the list
3. The 3D cubemap viewer shows detection overlays
4. In the detections table, use **Confirm**, **Reject**, or **Reclassify** on each detection
5. Confirmed detections automatically create asset records

---

## 6. View Assets

The **Assets** tab shows all confirmed assets. Filter by property to see assets for a specific site.

---

## 7. Retrain the Model

After accumulating confirmed detections, trigger a retraining cycle from the UI or directly:

```bash
curl -X POST http://localhost:5000/ml/retrain \
  -H "Authorization: Bearer <your-jwt-token>"
```

Check status:

```bash
curl http://localhost:5000/ml/retrain/status
```

---

## Manual Setup (Without Docker)

### Database

Run PostgreSQL 15+ with PostGIS and initialize the schema:

```bash
psql $DATABASE_URL -f infra/db/init.sql
```

### Backend

```bash
cd backend
npm install
node index.js
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### ML Service

Python 3.11+ required.

```bash
cd ml
pip install -r requirements.txt
python main.py
```

---

## Utility Scripts

| Script | Purpose |
|---|---|
| `python tmp/run_yolo_once.py` | Re-run YOLO inference on all S3 panoramas |
| `python helperscripts/upload_panoramas.py` | Batch upload panoramas from local disk |
| `python helperscripts/reset_detections.py` | Clear detections only (preserves panoramas) |
| `python helperscripts/clear_database.py` | Reset all tables (with confirmation prompt) |

---

## Troubleshooting

**Detections not appearing after upload**
- Check ML service logs: `docker compose logs -f ml`
- Verify the model file exists at `ml/model/best.pt`
- Run `python tmp/run_yolo_once.py` to force reprocessing

**Images not loading**
- Confirm `AWS_S3_BUCKET`, `AWS_REGION`, and credentials are set in `.env`
- Check that the IAM user has `s3:GetObject` permission on the bucket

**Database connection errors**
- Confirm `DATABASE_URL` is correct
- For Docker setup, the `db` service must be healthy before the backend starts (handled automatically by `depends_on`)
