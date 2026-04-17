import csv
import datetime as dt
import json
import os
import re
import uuid
from pathlib import Path

import boto3
import psycopg


ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env"
INIT_SQL_PATH = ROOT / "infra" / "db" / "init.sql"
IMAGES_ROOT = ROOT / "Datasets" / "Images"
CSV_PATH = IMAGES_ROOT / "scsu_panorama_ids_dataset.csv"

PROPERTY_NAME = "Test Property"
PROPERTY_ADDR = "Sample Address"
DEFAULT_LEVEL = "Level 1"
DEFAULT_ALT = 0.0
DEFAULT_HEADING = 0.0

FACE_NORMALIZE = {
    "f": "front",
    "b": "back",
    "l": "left",
    "r": "right",
    "u": "top",
    "t": "top",
    "d": "bottom",
}

FOLDER_PRIORITY = {
    "val": 1,
    "train": 2,
    "test": 3,
    "extra": 4,
    "new": 5,
}


def load_env(path: Path) -> None:
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ[k.strip()] = v.strip()


def connect_db() -> psycopg.Connection:
    db_url = os.environ.get("DATABASE_URL") or os.environ.get("DB_URL")
    if not db_url:
        raise RuntimeError("Missing DATABASE_URL/DB_URL in .env")
    return psycopg.connect(db_url)


def reset_schema(conn: psycopg.Connection) -> None:
    with conn.cursor() as cur:
        cur.execute("DROP SCHEMA public CASCADE;")
        cur.execute("CREATE SCHEMA public;")
        cur.execute("GRANT ALL ON SCHEMA public TO postgres;")
        cur.execute("GRANT ALL ON SCHEMA public TO public;")
        cur.execute(INIT_SQL_PATH.read_text(encoding="utf-8"))
        for face in ("top", "bottom", "front", "back", "left", "right"):
            cur.execute(
                f"ALTER TABLE panoramas ADD COLUMN IF NOT EXISTS s3_key_{face} TEXT;"
            )
    conn.commit()


def ensure_property(cur: psycopg.Cursor) -> int:
    cur.execute("SELECT id FROM properties WHERE name=%s", (PROPERTY_NAME,))
    row = cur.fetchone()
    if row:
        return row[0]
    cur.execute(
        "INSERT INTO properties (name, addr, crs) VALUES (%s, %s, 'EPSG:4326') RETURNING id",
        (PROPERTY_NAME, PROPERTY_ADDR),
    )
    return cur.fetchone()[0]


def parse_csv_metadata(csv_path: Path) -> dict:
    metadata = {}
    with csv_path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            id_with_side = (row.get("id_with_side") or "").strip()
            if not id_with_side or "_" not in id_with_side:
                continue
            pano_id, _ = id_with_side.rsplit("_", 1)
            if pano_id in metadata:
                continue
            try:
                lat = float(row.get("latitude") or 0)
                lon = float(row.get("longitude") or 0)
                heading = float(row.get("orientation") or DEFAULT_HEADING)
            except ValueError:
                lat, lon, heading = 0.0, 0.0, DEFAULT_HEADING
            level = (row.get("photo level metadata") or DEFAULT_LEVEL).strip() or DEFAULT_LEVEL
            ts_raw = (row.get("created at") or "").strip()
            try:
                captured_at = dt.datetime.strptime(ts_raw, "%Y-%m-%d %H:%M:%S UTC")
            except ValueError:
                captured_at = dt.datetime.utcnow()
            metadata[pano_id] = {
                "lat": lat,
                "lon": lon,
                "heading_deg": heading,
                "level": level,
                "captured_at": captured_at,
            }
    return metadata


def rank_path(path: Path) -> tuple:
    lower_parts = [p.lower() for p in path.parts]
    folder_rank = 99
    for name, score in FOLDER_PRIORITY.items():
        if name in lower_parts:
            folder_rank = score
            break
    return (folder_rank, len(str(path)))


def scan_images(root: Path) -> dict:
    pattern = re.compile(r"^(\d+)_([fblrudt])\.(jpg|jpeg|png)$", re.IGNORECASE)
    grouped = {}
    for p in root.rglob("*"):
        if not p.is_file():
            continue
        m = pattern.match(p.name)
        if not m:
            continue
        pano_id, side, _ = m.groups()
        face = FACE_NORMALIZE[side.lower()]
        grouped.setdefault(pano_id, {})
        if face in grouped[pano_id]:
            existing = grouped[pano_id][face]
            if rank_path(p) < rank_path(existing):
                grouped[pano_id][face] = p
        else:
            grouped[pano_id][face] = p
    return grouped


def make_s3_client():
    return boto3.client(
        "s3",
        region_name=os.environ.get("AWS_REGION", "us-east-1"),
        aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
    )


def upload_face(s3, bucket: str, pano_id: str, face: str, path: Path) -> tuple[str, int, str]:
    data = path.read_bytes()
    ext = path.suffix.lower().lstrip(".") or "jpg"
    ctype = "image/png" if ext == "png" else "image/jpeg"
    key = f"uploads/panoramas/imported/pano-{pano_id}/{face}-{uuid.uuid4().hex[:12]}.{ext}"
    s3.put_object(Bucket=bucket, Key=key, Body=data, ContentType=ctype)
    return key, len(data), ctype


def main():
    load_env(ENV_PATH)

    bucket = os.environ.get("AWS_S3_BUCKET")
    if not bucket:
        raise RuntimeError("Missing AWS_S3_BUCKET in .env")
    if not CSV_PATH.exists():
        raise RuntimeError(f"CSV not found: {CSV_PATH}")
    if not IMAGES_ROOT.exists():
        raise RuntimeError(f"Image root not found: {IMAGES_ROOT}")

    metadata = parse_csv_metadata(CSV_PATH)
    grouped = scan_images(IMAGES_ROOT)
    if not grouped:
        raise RuntimeError("No images found for import")

    print(f"Found metadata for {len(metadata)} panoramas")
    print(f"Found image groups for {len(grouped)} panoramas")

    s3 = make_s3_client()
    conn = connect_db()
    reset_schema(conn)

    inserted = 0
    skipped = 0
    upload_failures = 0
    uploaded_faces = 0

    try:
        with conn.cursor() as cur:
            property_id = ensure_property(cur)

            for idx, pano_id in enumerate(sorted(grouped.keys(), key=lambda x: int(x)), start=1):
                faces = grouped[pano_id]
                if "front" not in faces and "back" not in faces:
                    skipped += 1
                    continue

                meta = metadata.get(
                    pano_id,
                    {
                        "lat": 0.0,
                        "lon": 0.0,
                        "heading_deg": DEFAULT_HEADING,
                        "level": DEFAULT_LEVEL,
                        "captured_at": dt.datetime.utcnow(),
                    },
                )

                s3_keys = {
                    "top": None,
                    "bottom": None,
                    "front": None,
                    "back": None,
                    "left": None,
                    "right": None,
                }
                face_presence = {}
                byte_total = 0
                content_type = "image/jpeg"

                failed = False
                for face, img_path in faces.items():
                    try:
                        key, size, ctype = upload_face(s3, bucket, pano_id, face, img_path)
                        s3_keys[face] = key
                        face_presence[face] = True
                        byte_total += size
                        content_type = ctype
                        uploaded_faces += 1
                    except Exception as exc:
                        failed = True
                        upload_failures += 1
                        print(f"Upload failed pano={pano_id} face={face}: {exc}")
                        break

                if failed:
                    continue

                faces_json = {
                    "faces": face_presence,
                    "meta": {
                        "lat": meta["lat"],
                        "lon": meta["lon"],
                        "alt": DEFAULT_ALT,
                        "timestamp": meta["captured_at"].isoformat(),
                        "property_id": property_id,
                        "level": meta["level"],
                        "source_pano_id": str(pano_id),
                    },
                }

                cur.execute(
                    """
                    INSERT INTO panoramas (
                      property_id, level, lat, lon, alt, heading_deg, captured_at, faces_json,
                      img_top, img_bottom, img_front, img_back, img_left, img_right,
                      s3_key_top, s3_key_bottom, s3_key_front, s3_key_back, s3_key_left, s3_key_right,
                      image_content_type, image_byte_length
                    )
                    VALUES (
                      %s, %s, %s, %s, %s, %s, %s, %s,
                      NULL, NULL, NULL, NULL, NULL, NULL,
                      %s, %s, %s, %s, %s, %s,
                      %s, %s
                    )
                    """,
                    (
                        property_id,
                        meta["level"],
                        meta["lat"],
                        meta["lon"],
                        DEFAULT_ALT,
                        meta["heading_deg"],
                        meta["captured_at"],
                        json.dumps(faces_json),
                        s3_keys["top"],
                        s3_keys["bottom"],
                        s3_keys["front"],
                        s3_keys["back"],
                        s3_keys["left"],
                        s3_keys["right"],
                        content_type,
                        byte_total,
                    ),
                )
                inserted += 1

                if idx % 25 == 0:
                    conn.commit()
                    print(
                        f"Progress {idx}/{len(grouped)} inserted={inserted} "
                        f"uploaded_faces={uploaded_faces} skipped={skipped}"
                    )

            conn.commit()
    finally:
        conn.close()

    print(
        {
            "inserted_panoramas": inserted,
            "skipped_without_front_back": skipped,
            "uploaded_faces": uploaded_faces,
            "upload_failures": upload_failures,
            "bucket": bucket,
            "images_root": str(IMAGES_ROOT),
            "csv": str(CSV_PATH),
        }
    )


if __name__ == "__main__":
    main()

