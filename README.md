# IFC Asset Detection (Cloud Edition)

A professional web application for managing IFC (Industry Foundation Classes) assets using a 3D panorama viewer. Powered by AWS for scalable storage and data management.

## 🚀 Key Features
- **3D Panorama Viewer:** Interactive spatial visualization of campus environments.
- **AI-Powered Detection:** Automatic identification of doors, windows, and fixtures using YOLOv8.
- **Cloud Architecture:** Panorama images hosted on **AWS S3** and metadata managed via **AWS RDS (PostgreSQL)**.
- **Review Dashboard:** Industry-standard UI for accepting, rejecting, and editing IFC detections.

## 🛠️ Tech Stack
- **Frontend:** React, Three.js, Vite
- **Backend:** Node.js, Express, PostgreSQL
- **ML Service:** Python, Ultralytics (YOLO), OpenCV
- **Cloud:** AWS S3, AWS RDS

---

## 🏁 Quick Start

### 1. Configure Credentials
Copy the example environment file and add your AWS/Database keys:
```bash
cp .env.example .env
```

### 2. Launch (Docker Recommended)
Standard deployment with persistent cloud connectivity:
```bash
docker compose up -d
```
Access the dashboard at: `http://localhost:5173`

---

## 🔧 Manual Setup

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
*Note: Python 3.11+ required.*
```bash
cd ml
pip install -r requirements.txt
python main.py
```

---

## 🔐 Authentication
The system includes a secure login flow. 
- **Default Username:** `admin`
- **Default Password:** `admin123`

---

## 📂 Project Structure
- `/backend`: API and AWS RDS integration logic.
- `/frontend`: Reingineered React dashboard with 3D Viewport.
- `/ml`: Python YOLO inference engine (S3-compatible).
- `/Datasets`: Research labels and panorama mappings.
