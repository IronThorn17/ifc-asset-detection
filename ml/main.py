import os, time, psycopg, cv2, json
import numpy as np
from ultralytics import YOLO

DB_URL = os.getenv("DB_URL", "postgres://postgres:postgres@db:5432/ifc_assets")
POLL_SECS = float(os.getenv("POLL_SECS", "5"))
MODEL_PATH = "model/best.pt"
MODEL_VERSION = "best.pt"
model = YOLO(MODEL_PATH)

# Load IFC class mapping
IFC_CLASS_MAPPING = {}
try:
    with open('ifc_class_mapping.json', 'r') as f:
        IFC_CLASS_MAPPING = json.load(f)
except Exception as e:
    print(f"Warning: Could not load IFC class mapping: {e}")

# -------------------------------------------
# DB HELPERS
# -------------------------------------------

PANO_FACES = {
    "front": "img_front",
    "back": "img_back",
    "left": "img_left",
    "right": "img_right",
    "top": "img_top",
    "bottom": "img_bottom"
}

def latest_pano(conn):
    """Return the latest panorama that has ALL SIX faces."""
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT id,
                   image_byte_length,
                   image_content_type
            FROM panoramas
            WHERE { " AND ".join([f"{col} IS NOT NULL" for col in PANO_FACES.values()]) }
            ORDER BY id DESC
            LIMIT 1
        """)
        return cur.fetchone()

def load_face_bytes(conn, pano_id, face_column):
    """Load one face of the panorama."""
    # Validate face_column is one of the allowed values to prevent SQL injection
    if face_column not in PANO_FACES.values():
        raise ValueError(f"Invalid face_column: {face_column}")

    with conn.cursor() as cur:
        cur.execute(f"SELECT {face_column} FROM panoramas WHERE id = %s", (pano_id,))
        row = cur.fetchone()
        return row[0] if row else None

# -------------------------------------------
# YOLO INFERENCE
# -------------------------------------------

def run_yolo_on_face(image_bytes):
    """Decode and run YOLO on a single face."""
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return []
    results = model(img)[0]
    return results.boxes

def save_detection_row(conn, pano_id, face_id, box):
    cls = int(box.cls)
    label = model.names[cls]
    conf = float(box.conf)

    # YOLO xyxy → xywh
    x1, y1, x2, y2 = box.xyxy.tolist()[0]
    w = float(x2 - x1)
    h = float(y2 - y1)
    bbox_xywh = [float(x1), float(y1), w, h]

    # Get enhanced class information
    class_info = IFC_CLASS_MAPPING.get(label, {})
    category = class_info.get("category", "Unknown")
    description = class_info.get("description", "")
    
    det = {
        "pano_id": pano_id,
        "model_version": MODEL_VERSION,
        "ifc_class": label,
        "label_display": label.replace("ifc", "IFC ").title(),
        "confidence": conf,
        "face_id": face_id,
        "bbox_xywh": bbox_xywh,
        "mask_uri": None,
        "sphere_coords_json": json.dumps({
            "category": category,
            "description": description
        })
    }

    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO detections (
                pano_id, model_version, ifc_class, label_display,
                confidence, face_id, bbox_xywh, mask_uri,
                sphere_coords_json, created_at
            ) VALUES (
                %(pano_id)s, %(model_version)s, %(ifc_class)s, %(label_display)s,
                %(confidence)s, %(face_id)s, %(bbox_xywh)s, %(mask_uri)s,
                %(sphere_coords_json)s, NOW()
            )
        """, det)

# -------------------------------------------
# MAIN PROCESS
# -------------------------------------------

def process_pano(conn, pano_id):
    print(f"[ML] Running inference for panorama {pano_id}...")

    for face_name, col_name in PANO_FACES.items():
        face_bytes = load_face_bytes(conn, pano_id, col_name)
        if not face_bytes:
            print(f"[WARN] {face_name} face missing for pano {pano_id}")
            continue

        print(f"[ML] Running YOLO on face: {face_name}")
        boxes = run_yolo_on_face(face_bytes)

        for box in boxes:
            save_detection_row(conn, pano_id, face_name, box)

    conn.commit()
    print(f"[ML] Completed pano {pano_id}")

def main():
    print("ML detection service running...")
    print(f"Loaded {len(IFC_CLASS_MAPPING)} IFC class mappings")
    last_seen = None

    with psycopg.connect(DB_URL) as conn:
        while True:
            row = latest_pano(conn)

            if row:
                pano_id, byte_len, ctype = row

                if pano_id != last_seen:
                    process_pano(conn, pano_id)
                    last_seen = pano_id

            time.sleep(POLL_SECS)

if __name__ == "__main__":
    main()