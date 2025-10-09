# IFC Asset Detection

Web application for managing IFC (Industry Foundation Classes) models with React frontend and Python backend.

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
   Access at `http://localhost:3000`

## Development

### Backend
```bash
cd backend
python -m venv venv
.\venv\Scripts\activate  # Windows
pip install -r requirements.txt
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
docker compose down -v # Reset database
```

### Frontend
```bash
npm install  # Install deps
npm start    # Dev server
npm build    # Production build
```
