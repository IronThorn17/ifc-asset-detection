# IFC Asset Detection

Web application for managing IFC (Industry Foundation Classes) models with React frontend, Node.js backend, and Python ML service.

## Quick Start

1. Clone the repository:

   ```bash
   git clone https://github.com/IronThorn17/ifc-asset-detection.git
   cd ifc-asset-detection
   ```

2. Start with Docker:
   ```bash
   docker compose up
   ```
   Access at `http://localhost:5173`

## Development

### Backend

```bash
cd backend
npm install
npm run dev
```

### ML Service

```bash
cd ml
python -m venv venv
.\venv\Scripts\activate  # Windows
pip install -r requirements.txt
python main.py
```

### Frontend

```bash
cd frontend
npm install
npm start
```

## Commands

### Docker

```bash
docker compose up      # Start
docker compose down    # Stop
docker compose up -d   # Run in background
docker compose up --build # Rebuild Containers
docker compose down -v # Reset database
```

### Frontend

```bash
npm install      # Install deps
npm run dev      # Dev server
npm run build    # Production build
npm run preview  # Preview production build
```
