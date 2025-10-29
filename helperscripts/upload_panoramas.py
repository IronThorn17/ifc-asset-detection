import os
import re
import psycopg2
from tqdm import tqdm

# ---------- CONFIG ----------
DB_CONFIG = {
    "dbname": "ifc_assets",
    "user": "postgres",
    "password": "postgres",
    "host": "localhost",  # use 'db' if running inside docker network
    "port": "5432",
}

PROPERTY_NAME = "Test Property"
PROPERTY_ADDR = "Sample Address"
# ----------------------------


def connect_db():
    return psycopg2.connect(**DB_CONFIG)


def ensure_property(cur):
    """Creates the test property if it doesn't exist and returns its ID."""
    cur.execute("SELECT id FROM properties WHERE name = %s", (PROPERTY_NAME,))
    row = cur.fetchone()
    if row:
        return row[0]

    cur.execute(
        "INSERT INTO properties (name, addr, crs) VALUES (%s, %s, 'EPSG:4326') RETURNING id",
        (PROPERTY_NAME, PROPERTY_ADDR),
    )
    return cur.fetchone()[0]


def read_image_bytes(path):
    """Reads an image file as bytes, returning None if not found."""
    try:
        with open(path, "rb") as f:
            return f.read()
    except Exception:
        return None


def insert_pano(cur, property_id, pano_id, face_bytes):
    """Inserts a panorama record with whatever images exist."""
    cur.execute(
        """
        INSERT INTO panoramas (
            property_id, level, lat, lon, alt, heading_deg,
            img_top, img_bottom, img_front, img_back, img_left, img_right,
            image_content_type, image_byte_length
        )
        VALUES (%s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s,
                %s, %s)
        RETURNING id
        """,
        (
            property_id,
            "Level 1",
            0.0, 0.0, 0.0, 0.0,
            face_bytes.get("t"),
            face_bytes.get("d"),
            face_bytes.get("f"),
            face_bytes.get("b"),
            face_bytes.get("l"),
            face_bytes.get("r"),
            "image/jpeg",
            sum(len(v) for v in face_bytes.values() if v is not None),
        ),
    )


def upload_panoramas(base_dir):
    """Scans folder for *_<dir>.jpg images and uploads grouped sets."""
    conn = connect_db()
    cur = conn.cursor()
    property_id = ensure_property(cur)

    # Match patterns like "12345_f.jpg" or "987654_t.jpeg"
    pattern = re.compile(r"(\d+)_([fblrtd])\.(jpg|jpeg|png)$", re.IGNORECASE)
    grouped = {}

    # Walk through all subdirectories
    for root, _, files in os.walk(base_dir):
        for file in files:
            match = pattern.match(file)
            if match:
                pano_id, direction, _ = match.groups()
                grouped.setdefault(pano_id, {})[direction.lower()] = os.path.join(root, file)

    if not grouped:
        print("No matching panorama images found.")
        return

    print(f"Found {len(grouped)} panoramas to upload.")

    for pano_id, faces in tqdm(grouped.items(), desc="Uploading panoramas"):
        face_bytes = {k: read_image_bytes(v) for k, v in faces.items()}
        insert_pano(cur, property_id, pano_id, face_bytes)

    conn.commit()
    cur.close()
    conn.close()
    print("Upload complete.")


if __name__ == "__main__":
    folder = input("Enter the path to the image folder: ").strip('"').strip("'")
    if not os.path.isdir(folder):
        print("Invalid directory path.")
    else:
        upload_panoramas(folder)
