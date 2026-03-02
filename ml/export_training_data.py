"""
Export training data from DB + CSV for YOLO fine-tuning.
Uses CSV to identify panorama faces in the dataset; uses detections + user reviews
(accept/reject/reclassify) for labels. Runs best after user has reviewed detections.
"""
import os
import json
import csv
import hashlib
import psycopg
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DB_URL = os.getenv("DB_URL", "postgres://postgres:postgres@localhost:5432/ifc_assets")
OUTPUT_DIR = os.getenv("EXPORT_OUTPUT_DIR", str(PROJECT_ROOT / "Datasets" / "scsu_export"))
CSV_PATH = os.getenv("CSV_PATH", str(PROJECT_ROOT / "Datasets" / "Images" / "scsu_panorama_ids_dataset.csv"))

# Face mapping: DB face_id <-> CSV suffix
FACE_TO_SUFFIX = {"front": "f", "back": "b", "left": "l", "right": "r", "top": "t", "bottom": "d"}
SUFFIX_TO_FACE = {v: k for k, v in FACE_TO_SUFFIX.items()}

# Class order must match data.yaml
CLASS_NAMES = [
    "ifcDoor", "ifcSign", "ifcWall", "ifcFurniture", "ifcLightFixture", "ifcAirTerminal",
    "ifcComputer", "ifcSwitchingDevice", "ifcSensor", "ifcWindow", "ifcAudioVisualAppliance",
    "ifcElectricalOutlet", "ifcSanitaryTerminal", "ifcEquipmentElement", "ifcFurnishingElement",
    "ifcDuctSegment", "ifcController",
]
CLASS_TO_IDX = {c: i for i, c in enumerate(CLASS_NAMES)}

PANO_FACES = {
    "front": "img_front", "back": "img_back", "left": "img_left",
    "right": "img_right", "top": "img_top", "bottom": "img_bottom",
}


def load_csv_ids(csv_path):
    """Return set of 'pano_id_face' from CSV (e.g. 1185574_f)."""
    ids = set()
    if not os.path.isfile(csv_path):
        print(f"CSV not found: {csv_path}, including all DB faces")
        return None
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            iw = row.get("id_with_side", "").strip()
            if iw:
                ids.add(iw)
    print(f"Loaded {len(ids)} id_with_side from CSV")
    return ids


def get_panoramas_with_detections(conn):
    """Yield (pano_id, source_pano_id, faces_json) for panoramas that have detections."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT p.id, p.faces_json
            FROM panoramas p
            WHERE EXISTS (SELECT 1 FROM detections d WHERE d.pano_id = p.id)
        """)
        for row in cur.fetchall():
            pano_id, fj = row[0], row[1]
            fj = fj or {}
            meta = fj.get("meta") or {}
            source = meta.get("source_pano_id") or str(pano_id)
            yield pano_id, source, fj


def get_detections_with_reviews(conn, pano_id):
    """Return detections with effective class after reviews.
    For each detection: (face_id, bbox_xywh, class_name). Rejected detections excluded.
    """
    with conn.cursor() as cur:
        cur.execute("""
            SELECT d.id, d.face_id, d.bbox_xywh, d.ifc_class,
                   r.action, r.new_class
            FROM detections d
            LEFT JOIN LATERAL (
                SELECT action, new_class FROM reviews
                WHERE detection_id = d.id ORDER BY created_at DESC LIMIT 1
            ) r ON true
            WHERE d.pano_id = %s
        """, (pano_id,))
        rows = cur.fetchall()

    out = []
    for r in rows:
        det_id, face_id, bbox, ifc_class, action, new_class = r
        if action == "reject":
            continue
        cls = (new_class or ifc_class or "").strip()
        if cls not in CLASS_TO_IDX:
            continue
        if not bbox or len(bbox) != 4:
            continue
        out.append((face_id, list(bbox), cls))
    return out


def load_face_image(conn, pano_id, face_column):
    if face_column not in PANO_FACES.values():
        return None
    with conn.cursor() as cur:
        cur.execute(f"SELECT {face_column} FROM panoramas WHERE id = %s", (pano_id,))
        row = cur.fetchone()
        return row[0] if row else None


def build_dataset(conn, csv_ids, output_dir, val_ratio=0.2):
    os.makedirs(os.path.join(output_dir, "images", "train"), exist_ok=True)
    os.makedirs(os.path.join(output_dir, "images", "val"), exist_ok=True)
    os.makedirs(os.path.join(output_dir, "labels", "train"), exist_ok=True)
    os.makedirs(os.path.join(output_dir, "labels", "val"), exist_ok=True)

    train_count = val_count = 0
    for pano_id, source_pano_id, fj in get_panoramas_with_detections(conn):
        faces_present = (fj.get("faces") or {}).keys()
        for face_name, col in PANO_FACES.items():
            if face_name not in faces_present:
                continue
            suffix = FACE_TO_SUFFIX.get(face_name, face_name[0])
            id_with_side = f"{source_pano_id}_{suffix}"
            if csv_ids is not None and id_with_side not in csv_ids:
                continue

            img_bytes = load_face_image(conn, pano_id, col)
            if not img_bytes:
                continue

            dets = get_detections_with_reviews(conn, pano_id)
            face_dets = [d for d in dets if d[0] == face_name]
            if not face_dets:
                continue

            # Split train/val by hash
            h = int(hashlib.md5(f"{pano_id}_{face_name}".encode()).hexdigest(), 16) % 100
            split = "val" if h < val_ratio * 100 else "train"
            if split == "train":
                train_count += 1
            else:
                val_count += 1

            base = id_with_side
            img_path = os.path.join(output_dir, "images", split, f"{base}.jpg")
            with open(img_path, "wb") as f:
                f.write(img_bytes)

            lines = []
            for _, bbox, cls in face_dets:
                cid = CLASS_TO_IDX[cls]
                cx, cy, w, h = bbox[0], bbox[1], bbox[2], bbox[3]
                lines.append(f"{cid} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}")

            label_path = os.path.join(output_dir, "labels", split, f"{base}.txt")
            with open(label_path, "w") as f:
                f.write("\n".join(lines))

    return train_count, val_count


def write_data_yaml(output_dir):
    path = os.path.join(output_dir, "data.yaml")
    abs_out = os.path.abspath(output_dir)
    content = f"""# Auto-generated for scsu export
train: {abs_out}/images/train
val: {abs_out}/images/val
nc: {len(CLASS_NAMES)}
names: {CLASS_NAMES}
"""
    with open(path, "w") as f:
        f.write(content)
    print(f"Wrote {path}")


def main():
    csv_ids = load_csv_ids(CSV_PATH)
    out = Path(OUTPUT_DIR)
    out.mkdir(parents=True, exist_ok=True)

    with psycopg.connect(DB_URL) as conn:
        train_n, val_n = build_dataset(conn, csv_ids, str(out))
        # If CSV filter excluded everything (e.g. old DB without source_pano_id), include all
        if train_n == 0 and val_n == 0 and csv_ids:
            print("No matches for CSV ids (re-upload to store source_pano_id). Including all DB faces.")
            train_n, val_n = build_dataset(conn, None, str(out))

    write_data_yaml(str(out))
    print(f"Exported {train_n} train, {val_n} val samples to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
