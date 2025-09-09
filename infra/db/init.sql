CREATE EXTENSION IF NOT EXISTS postgis;

-- Core tables (minimal V1 slice)
CREATE TABLE IF NOT EXISTS properties (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  addr TEXT,
  crs TEXT DEFAULT 'EPSG:4326'
);

CREATE TABLE IF NOT EXISTS panoramas (
  id SERIAL PRIMARY KEY,
  property_id INT REFERENCES properties(id) ON DELETE CASCADE,
  level TEXT,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  heading_deg DOUBLE PRECISION,
  captured_at TIMESTAMPTZ,
  faces_json JSONB,
  storage_uri TEXT
);

CREATE TABLE IF NOT EXISTS detections (
  id SERIAL PRIMARY KEY,
  pano_id INT REFERENCES panoramas(id) ON DELETE CASCADE,
  model_version TEXT,
  ifc_class TEXT,
  label_display TEXT,
  confidence DOUBLE PRECISION,
  face_id TEXT,
  bbox_xywh DOUBLE PRECISION[],
  mask_uri TEXT,
  sphere_coords_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assets (
  id SERIAL PRIMARY KEY,
  property_id INT REFERENCES properties(id) ON DELETE CASCADE,
  ifc_class TEXT,
  status TEXT CHECK (status IN ('proposed','confirmed','rejected')) DEFAULT 'proposed',
  geometry GEOMETRY,
  source_detection_ids INT[],
  attributes_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  detection_id INT REFERENCES detections(id) ON DELETE CASCADE,
  reviewer TEXT,
  action TEXT CHECK (action IN ('confirm','reject','reclassify')) NOT NULL,
  new_class TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
