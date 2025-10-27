import os
import re
import psycopg2
from tqdm import tqdm

# ---------- CONFIG ----------
DB_CONFIG = {
    "dbname": "ifc_assets",
    "user": "postgres",
    "password": "postgres",
    "host": "localhost",
    "port": "5432",
}

PROPERTY_NAME = "Test Property"
PROPERTY_ADDR = "Sample Address"
# ----------------------------

def connect_db():
    return psycopg2.connect(**DB_CONFIG)

def ensure_property(cur):
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
    with open(path, "rb") as f:
        return f.read()

def insert_pano(cur, property_id, pano_id, face_bytes):
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
            0.0, 0.0, 0.0, 0.0,  # placeholder geo
            None, None,  # top, bottom missing
            face_bytes.get("f"),
            face_bytes.get("b"),
            face_bytes.get("l"),
            face_bytes.get("r"),
            "image/jpeg",
            sum(len(v) for v in face_bytes.values() if v is not None),
        ),
    )

def upload_panoramas(base_dir):
    conn = connect_db()
    cur = conn.cursor()
    property_id = ensure_property(cur)

    # Group files by ID
    pattern = re.compile(r"(\d+)_([fblr])", re.IGNORECASE)
    grouped = {}

    for file in os.listdir(base_dir):
        match = pattern.match(file)
        if match:
            pano_id, direction = match.groups()
            grouped.setdefault(pano_id, {})[direction.lower()] = os.path.join(base_dir, file)

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
