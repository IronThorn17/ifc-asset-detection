# IFC Asset Detection (Cloud Edition)

A professional web application for managing IFC (Industry Foundation Classes) assets using a 3D panorama viewer. Powered by AWS for scalable storage and data management.

## Key Features

- **3D Panorama Viewer:** Interactive spatial visualization of campus environments.
- **AI-Powered Detection:** Automatic identification of doors, windows, and fixtures using YOLOv8.
- **Cloud Architecture:** Panorama images hosted on **AWS S3** and metadata managed via **AWS RDS (PostgreSQL)**.
- **Review Dashboard:** Industry-standard UI for accepting, rejecting, and editing IFC detections.

## Tech Stack

- **Frontend:** React, Three.js, Vite
- **Backend:** Node.js, Express, PostgreSQL
- **ML Service:** Python, Ultralytics (YOLO), OpenCV
- **Cloud:** AWS S3, AWS RDS

---

## Quick Start

### 1. Configure Credentials

Copy the example environment file and add your AWS/Database keys:

```bash
cp .env.example .env
```

Also copy the same values into `backend/.env` when running backend directly.

Required minimum variables:

- `DATABASE_URL` (or `DB_URL`) -> AWS RDS PostgreSQL
- `AWS_S3_BUCKET` -> current project bucket
- `AWS_REGION` -> `us-east-1`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `JWT_SECRET`

### 2. Launch

Docker deployment:

```bash
docker compose up -d
```

Access the dashboard at: `http://localhost:5173`

Local development:

- Backend: `http://localhost:5000`
- Frontend: `http://localhost:5173`

---

## Manual Setup

### Backend (Port 5000)

```bash
cd backend
npm install
node index.js
```

### Frontend (Port 5173)

```bash
cd frontend
npm install
npm run dev
```

### ML Service (Port 5001)

_Note: Python 3.11+ required._

```bash
cd ml
pip install -r requirements.txt
python main.py
```

---

## Panorama Data + Storage Model

- Panorama faces are stored in **AWS S3** and referenced by `s3_key_*` columns in `panoramas`.
- `img_*` blob columns are intentionally left empty in cloud mode.
- Top/Bottom (`u`/`d`) faces appear only when those files exist in the source dataset.

### Current import source

- CSV: `Datasets/Images/scsu_panorama_ids_dataset.csv`
- Images: `Datasets/Images/**`

### Re-run one-time YOLO detections on imported panoramas

```bash
python tmp/run_yolo_once.py
```

This runs inference with `ml/model/best.pt` and writes rows into `detections`.

---

## Authentication

The system includes a secure login flow.

- **Default Username:** `admin`
- **Default Password:** `admin123`

---

## Project Structure

- `/backend`: API and AWS RDS integration logic.
- `/frontend`: Reingineered React dashboard with 3D Viewport.
- `/ml`: Python YOLO inference engine (S3-compatible).
- `/Datasets`: Research labels and panorama mappings.
- `/tmp/run_yolo_once.py`: one-time detection backfill script for imported S3 panoramas.

---

- If detections are empty after DB reset/import, run:

```bash
python tmp/run_yolo_once.py
```
