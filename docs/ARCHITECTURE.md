# System Architecture

## Overview

IFC Asset Detection is a four-service system: a React frontend, a Node.js/Express API, a Python/YOLO ML service, and a PostgreSQL/PostGIS database. Images are stored in AWS S3; metadata and detections are stored in the database.

```mermaid
graph TD
    User[Browser] -->|HTTP :5173| FE[Frontend\nReact + Vite]
    FE -->|REST :5000| BE[Backend\nNode.js + Express]
    BE --> DB[(PostgreSQL\nPostGIS :5432)]
    BE --> S3[AWS S3\nImage Storage]
    ML[ML Service\nPython + YOLOv8 :5001] -->|polls every 5s| DB
    ML -->|fetches images| S3
    BE -->|POST /retrain| ML
```

---

## Services

| Service | Language / Framework | Port | Role |
|---|---|---|---|
| frontend | React 19, Vite 7, Three.js | 5173 | Review UI, upload, asset list |
| backend | Node.js 20, Express 4 | 5000 | REST API, auth, DB, S3 |
| ml | Python 3.11, YOLOv8, Flask | 5001 (internal) | Batch inference, retraining |
| db | PostgreSQL 15 + PostGIS | 5432 | Persistent storage |

All four services are orchestrated via Docker Compose.

---

## Data Flow

### Panorama Ingestion

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant S3
    participant DB

    User->>Frontend: Upload panorama images + metadata
    Frontend->>Backend: POST /ingest/pano-file or /ingest/pano-set
    Backend->>S3: Upload image(s)
    Backend->>DB: INSERT into panoramas (s3_key_*, lat, lon, heading_deg, ...)
    Backend-->>Frontend: { ok: true, pano_id }
```

### ML Detection Pipeline

```mermaid
sequenceDiagram
    participant ML
    participant DB
    participant S3

    loop every 5 seconds
        ML->>DB: SELECT unprocessed panoramas
        alt new panoramas found
            ML->>S3: Fetch face images
            ML->>ML: Run YOLOv8 on each of 6 faces
            ML->>DB: INSERT detections (ifc_class, confidence, bbox_xywh, face_id)
        end
    end
```

### Review & Asset Confirmation

```mermaid
sequenceDiagram
    participant Reviewer
    participant Frontend
    participant Backend
    participant DB

    Reviewer->>Frontend: View panorama detections
    Frontend->>Backend: GET /detections?pano_id=X
    Backend-->>Frontend: detection list with last review_action
    Reviewer->>Frontend: Click confirm / reject / reclassify
    Frontend->>Backend: POST /review { detection_id, action, new_class? }
    Backend->>DB: INSERT into reviews
    alt action == confirm
        Backend->>DB: INSERT into assets (status=confirmed)
    end
```

### Model Retraining

```mermaid
sequenceDiagram
    participant User
    participant Backend
    participant ML
    participant DB

    User->>Backend: POST /ml/retrain
    Backend->>ML: trigger retrain
    ML->>DB: export confirmed detections
    ML->>ML: format YOLO dataset
    ML->>ML: fine-tune YOLOv8 on new data
    ML->>ML: save best.pt, set reload flag
    ML->>ML: reload model for next inference cycle
    ML-->>Backend: done
```

---

## Database Schema

```mermaid
erDiagram
    properties {
        int id PK
        text name
        text addr
        text crs
    }
    panoramas {
        int id PK
        int property_id FK
        text level
        float lat
        float lon
        float alt
        float heading_deg
        timestamptz captured_at
        jsonb faces_json
        text s3_key_front
        text s3_key_back
        text s3_key_left
        text s3_key_right
        text s3_key_top
        text s3_key_bottom
    }
    detections {
        int id PK
        int pano_id FK
        text model_version
        text ifc_class
        text label_display
        float confidence
        text face_id
        float[] bbox_xywh
        jsonb sphere_coords_json
        timestamptz created_at
    }
    assets {
        int id PK
        int property_id FK
        text ifc_class
        text status
        geometry geometry
        int[] source_detection_ids
        jsonb attributes_json
        timestamptz created_at
    }
    reviews {
        int id PK
        int detection_id FK
        text reviewer
        text action
        text new_class
        text note
        timestamptz created_at
    }
    properties ||--o{ panoramas : contains
    panoramas ||--o{ detections : produces
    detections ||--o{ reviews : has
    properties ||--o{ assets : owns
```

> `s3_key_*` columns are used in cloud mode. The `img_*` BYTEA columns exist for legacy/local use and are empty in cloud deployments.

---

## Image Loading Strategy

```mermaid
flowchart TD
    A[GET /pano/:id/image/:face] --> B{s3_key_* exists?}
    B -- Yes --> C[Fetch from AWS S3\nCache-Control: 3600s]
    B -- No --> D{img_* BYTEA exists?}
    D -- Yes --> E[Return blob from DB]
    D -- No --> F[404 Not Found]
```

---

## API Reference

### Authentication
| Method | Path | Description |
|---|---|---|
| POST | `/login` | Returns JWT token (24h expiry) |

### Panoramas
| Method | Path | Description |
|---|---|---|
| POST | `/ingest/pano-file` | Upload single panorama file |
| POST | `/ingest/pano-set` | Upload 6-face cubemap set |
| GET | `/panoramas` | List panoramas (`?unreviewed=true` filter) |
| GET | `/pano/:id` | Panorama metadata + face availability |
| GET | `/pano/:id/image/:face` | Stream face image (S3 or blob fallback) |

### Detections
| Method | Path | Description |
|---|---|---|
| GET | `/detections?pano_id=X` | All detections for a panorama with last review action |
| POST | `/detection/:id/class` | Update IFC class |
| POST | `/detection/:id/bbox` | Edit bounding box |

### Reviews & Assets
| Method | Path | Description |
|---|---|---|
| POST | `/review` | Confirm / reject / reclassify a detection |
| GET | `/assets?property_id=X` | List confirmed assets |

### ML
| Method | Path | Description |
|---|---|---|
| POST | `/ml/retrain` | Trigger model retraining |
| GET | `/ml/retrain/status` | Retraining status: idle / running / done / error |

### Health
| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness probe |

---

## IFC Class Mapping

The ML service uses `ml/ifc_class_mapping.json` to map YOLO output class names to IFC types. Currently 17 classes are supported:

`ifcDoor`, `ifcWindow`, `ifcWall`, `ifcFurniture`, `ifcLightFixture`, `ifcAirTerminal`, `ifcComputer`, `ifcSwitchingDevice`, `ifcSensor`, `ifcAudioVisualAppliance`, `ifcElectricalOutlet`, `ifcSanitaryTerminal`, `ifcEquipmentElement`, `ifcFurnishingElement`, `ifcDuctSegment`, `ifcController`, `ifcSign`

To add a class: update `ifc_class_mapping.json` and retrain the YOLO model on labeled examples.

---

## Deployment

### Docker Compose (Development)

```
docker compose up -d
```

Services start in order: db → backend → frontend → ml.

**Volumes:**
- `db_data` — PostgreSQL persistence
- `./runs` — YOLO training outputs

### AWS Production (Recommended)
- **Database:** AWS RDS PostgreSQL 15+ with PostGIS extension
- **Images:** AWS S3 with IAM credentials scoped to `s3:GetObject` + `s3:PutObject`
- **Compute:** ECS/EC2 containers built from each service's Dockerfile
- **Region:** US regions only (data residency requirement)

### CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs on push/PR to `main`:
1. Frontend: lint + test + build
2. Backend: test
3. ML: pytest

Repository: https://github.com/IronThorn17/ifc-asset-detection
CI runs: https://github.com/IronThorn17/ifc-asset-detection/actions
