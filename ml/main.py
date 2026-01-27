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

def get_unprocessed_panos(conn):
    """Return a list of panorama IDs that have not been processed by the current model."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT p.id
            FROM panoramas p
            LEFT JOIN (
                SELECT DISTINCT pano_id
                FROM detections
                WHERE model_version = %s
            ) d ON p.id = d.pano_id
            WHERE d.pano_id IS NULL
            ORDER BY p.id
        """, (MODEL_VERSION,))
        return [row[0] for row in cur.fetchall()]

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
    """Decode and run YOLO on a single face, returns boxes and image dimensions."""
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return [], None
    results = model(img)[0]
    # Return boxes and image dimensions (width, height)
    return results.boxes, (img.shape[1], img.shape[0])

def save_detection_row(conn, pano_id, face_id, box, img_w, img_h):
    cls = int(box.cls)
    label = model.names[cls]
    conf = float(box.conf)

    # YOLO xyxy -> normalized xywh (center x, center y, width, height)
    x1, y1, x2, y2 = box.xyxy.tolist()[0]
    
    # Convert to center x,y, width, height
    box_w = float(x2 - x1)
    box_h = float(y2 - y1)
    center_x = float(x1 + box_w / 2)
    center_y = float(y1 + box_h / 2)

    # Normalize coordinates if image dimensions are valid
    if img_w > 0 and img_h > 0:
        norm_cx = center_x / img_w
        norm_cy = center_y / img_h
        norm_w = box_w / img_w
        norm_h = box_h / img_h
        
        bbox_xywh = [
            max(0.0, min(1.0, norm_cx)),
            max(0.0, min(1.0, norm_cy)),
            max(0.0, min(1.0, norm_w)),
            max(0.0, min(1.0, norm_h)),
        ]
    else:
        # Fallback for invalid image dimensions
        bbox_xywh = [0, 0, 0, 0]

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

    # Clear old detections for this panorama and model version
    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM detections WHERE pano_id = %s AND model_version = %s",
            (pano_id, MODEL_VERSION),
        )

    for face_name, col_name in PANO_FACES.items():
        face_bytes = load_face_bytes(conn, pano_id, col_name)
        if not face_bytes:
            print(f"[WARN] {face_name} face missing for pano {pano_id}")
            continue

        print(f"[ML] Running YOLO on face: {face_name}")
        boxes, dims = run_yolo_on_face(face_bytes)
        if not dims:
            print(f"[WARN] Could not decode image for face {face_name} of pano {pano_id}")
            continue
            
        img_w, img_h = dims

        for box in boxes:
            save_detection_row(conn, pano_id, face_name, box, img_w, img_h)

    conn.commit()
    print(f"[ML] Completed pano {pano_id}")

def main():
    print("ML detection service running...")
    print(f"Loaded {len(IFC_CLASS_MAPPING)} IFC class mappings")

    with psycopg.connect(DB_URL) as conn:
        while True:
            unprocessed_ids = get_unprocessed_panos(conn)

            if unprocessed_ids:
                print(f"Found {len(unprocessed_ids)} unprocessed panoramas to process.")
                for pano_id in unprocessed_ids:
                    process_pano(conn, pano_id)
                print("Finished processing batch.")
            else:
                print("No new panoramas to process. Waiting...")
            
            time.sleep(POLL_SECS)

if __name__ == "__main__":
    main()
