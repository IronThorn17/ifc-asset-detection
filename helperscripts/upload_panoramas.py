import os
import re
import psycopg2
from psycopg2 import extras
from tqdm import tqdm
import datetime
import json

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
DEFAULT_LEVEL = "Level 1"
DEFAULT_LAT = 0.0
DEFAULT_LON = 0.0
DEFAULT_ALT = 0.0
DEFAULT_HEADING = 0.0
# ----------------------------


def connect_db():
    return psycopg2.connect(
        dbname=DB_CONFIG["dbname"],
        user=DB_CONFIG["user"],
        password=DB_CONFIG["password"],
        host=DB_CONFIG["host"],
        port=DB_CONFIG["port"]
    )


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
    except Exception as e:
        print(f"Warning: Could not read image {path}: {e}")
        return None


def insert_pano(cur, property_id, pano_id, face_bytes, metadata=None):
    """Inserts a panorama record with whatever images exist."""
    # Skip if no front or back images (required for a panorama)
    if not face_bytes.get("f") and not face_bytes.get("b"):
        print(f"Skipping panorama {pano_id} - missing required front/back images")
        return None
    
    # Use default metadata if not provided
    if metadata is None:
        metadata = {
            "level": DEFAULT_LEVEL,
            "lat": DEFAULT_LAT,
            "lon": DEFAULT_LON,
            "alt": DEFAULT_ALT,
            "heading_deg": DEFAULT_HEADING,
            "captured_at": datetime.datetime.now()
        }
    
    # Create faces_json structure
    faces_present = {}
    if face_bytes.get("t"): faces_present["top"] = True
    if face_bytes.get("d"): faces_present["bottom"] = True
    if face_bytes.get("f"): faces_present["front"] = True
    if face_bytes.get("b"): faces_present["back"] = True
    if face_bytes.get("l"): faces_present["left"] = True
    if face_bytes.get("r"): faces_present["right"] = True
    
    faces_json = {
        "faces": faces_present,
        "meta": {
            "lat": metadata["lat"],
            "lon": metadata["lon"],
            "alt": metadata["alt"],
            "timestamp": metadata["captured_at"].isoformat() if metadata["captured_at"] else None,
            "property_id": property_id,
            "level": metadata["level"]
        }
    }
    
    cur.execute(
        """
        INSERT INTO panoramas (
            property_id, level, lat, lon, alt, heading_deg, captured_at, faces_json,
            img_top, img_bottom, img_front, img_back, img_left, img_right,
            image_content_type, image_byte_length
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s,
                %s, %s)
        RETURNING id
        """,
        (
            property_id,
            metadata["level"],
            metadata["lat"],
            metadata["lon"],
            metadata["alt"],
            metadata["heading_deg"],
            metadata["captured_at"],
            json.dumps(faces_json),
            face_bytes.get("t"),  # top
            face_bytes.get("d"),  # bottom
            face_bytes.get("f"),  # front
            face_bytes.get("b"),  # back
            face_bytes.get("l"),  # left
            face_bytes.get("r"),  # right
            "image/jpeg",
            sum(len(v) for v in face_bytes.values() if v is not None),
        ),
    )
    return cur.fetchone()[0]


def upload_panoramas(base_dir):
    """Scans folder for *_<dir>.jpg images and uploads grouped sets."""
    try:
        conn = connect_db()
        cur = conn.cursor()
        property_id = ensure_property(cur)

        # Match patterns like "12345_f.jpg" or "987654_t.jpeg"
        pattern = re.compile(r"(\d+)_([fblrtd])\.(jpg|jpeg|png)$", re.IGNORECASE)
        grouped = {}

        # Walk through all subdirectories
        print(f"Scanning directory: {base_dir}")
        for root, _, files in os.walk(base_dir):
            for file in files:
                match = pattern.match(file)
                if match:
                    pano_id, direction, _ = match.groups()
                    grouped.setdefault(pano_id, {})[direction.lower()] = os.path.join(root, file)

        if not grouped:
            print("No matching panorama images found.")
            return False

        print(f"Found {len(grouped)} panoramas to upload.")
        
        # Check if top and bottom images are missing (as mentioned in requirements)
        missing_top_bottom = 0
        for pano_id, faces in grouped.items():
            if not faces.get("t") and not faces.get("d"):
                missing_top_bottom += 1
        
        if missing_top_bottom > 0:
            print(f"Note: {missing_top_bottom} panoramas are missing top/bottom images (this is expected per requirements)")

        success_count = 0
        error_count = 0
        
        for pano_id, faces in tqdm(grouped.items(), desc="Uploading panoramas"):
            try:
                face_bytes = {k: read_image_bytes(v) for k, v in faces.items()}
                result = insert_pano(cur, property_id, pano_id, face_bytes)
                if result:
                    success_count += 1
                else:
                    error_count += 1
            except Exception as e:
                print(f"Error uploading panorama {pano_id}: {e}")
                error_count += 1

        conn.commit()
        cur.close()
        conn.close()
        
        print(f"Upload complete. Success: {success_count}, Errors: {error_count}")
        return True
        
    except Exception as e:
        print(f"Error connecting to database or uploading panoramas: {e}")
        return False


if __name__ == "__main__":
    print("IFC Asset Detection - Panorama Upload Script")
    print("=" * 45)
    
    folder = input("Enter the path to the image folder: ").strip('"').strip("'")
    if not os.path.isdir(folder):
        print("Invalid directory path.")
        exit(1)
    else:
        print(f"Processing images from: {folder}")
        success = upload_panoramas(folder)
        if success:
            print("Upload process completed.")
        else:
            print("Upload process failed.")
            exit(1)