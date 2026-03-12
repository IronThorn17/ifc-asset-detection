import os
import re
import csv
import json
import datetime
import urllib.request
import zipfile
import tempfile
import shutil
import psycopg2
from tqdm import tqdm

# ---------- CONFIG ----------
DB_CONFIG = {
    "dbname": "ifc_assets",
    "user": "postgres",
    "password": "postgres",
    "host": "db",
    "port": "5432",
}

PROPERTY_NAME = "Test Property"
PROPERTY_ADDR = "Sample Address"
DEFAULT_LEVEL = "Level 1"
DEFAULT_LAT = 0.0
DEFAULT_LON = 0.0
DEFAULT_ALT = 0.0
DEFAULT_HEADING = 0.0

DIRECTION_NORMALIZE = {"u": "t"}
VALID_DIRECTIONS = {"f", "b", "l", "r", "t", "d", "u"}
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


def load_csv_metadata(csv_path):
    metadata = {}
    ud_urls = {}

    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            id_with_side = row.get("id_with_side", "").strip()
            if not id_with_side:
                continue

            parts = id_with_side.rsplit("_", 1)
            if len(parts) != 2:
                continue
            pano_id, side = parts[0], parts[1].lower()

            # Store metadata once per panorama (all rows for same pano share it)
            if pano_id not in metadata:
                try:
                    lat = float(row.get("latitude", DEFAULT_LAT) or DEFAULT_LAT)
                    lon = float(row.get("longitude", DEFAULT_LON) or DEFAULT_LON)
                    heading = float(row.get("orientation", DEFAULT_HEADING) or DEFAULT_HEADING)
                except ValueError:
                    lat, lon, heading = DEFAULT_LAT, DEFAULT_LON, DEFAULT_HEADING

                raw_ts = row.get("created at", "").strip()
                try:
                    captured_at = datetime.datetime.strptime(raw_ts, "%Y-%m-%d %H:%M:%S UTC")
                except ValueError:
                    captured_at = datetime.datetime.now()

                level_raw = row.get("photo level metadata", DEFAULT_LEVEL).strip()
                level = level_raw if level_raw else DEFAULT_LEVEL

                metadata[pano_id] = {
                    "lat": lat,
                    "lon": lon,
                    "alt": DEFAULT_ALT,
                    "heading_deg": heading,
                    "captured_at": captured_at,
                    "level": level,
                }

            # Collect top/bottom URLs ('u' -> top slot 't', 'd' -> bottom slot 'd')
            if side in ("u", "d"):
                url = row.get("url", "").strip()
                if url:
                    db_slot = DIRECTION_NORMALIZE.get(side, side)
                    ud_urls.setdefault(pano_id, {})[db_slot] = url

    return metadata, ud_urls


def download_ud_images(ud_urls, output_dir):
    os.makedirs(output_dir, exist_ok=True)
    downloaded = {}
    total = sum(len(slots) for slots in ud_urls.values())

    print(f"Downloading {total} top/bottom images to: {output_dir}")

    with tqdm(total=total, desc="Downloading top/bottom") as pbar:
        for pano_id, slots in ud_urls.items():
            for db_slot, url in slots.items():
                # Use the original suffix in the filename for clarity
                file_suffix = "u" if db_slot == "t" else "d"
                filename = f"{pano_id}_{file_suffix}.jpg"
                dest_path = os.path.join(output_dir, filename)

                if os.path.exists(dest_path):
                    downloaded.setdefault(pano_id, {})[db_slot] = dest_path
                    pbar.update(1)
                    continue

                try:
                    urllib.request.urlretrieve(url, dest_path)
                    downloaded.setdefault(pano_id, {})[db_slot] = dest_path
                except Exception as e:
                    print(f"\nWarning: Could not download {pano_id}_{file_suffix}: {e}")
                pbar.update(1)

    return downloaded


def scan_image_dir(base_dir):
    # Match: <numeric_id>_<direction>.<ext>
    pattern = re.compile(r"^(\d+)_([fblrtdu])\.(jpg|jpeg|png)$", re.IGNORECASE)
    grouped = {}

    for root, _, files in os.walk(base_dir):
        for file in files:
            match = pattern.match(file)
            if not match:
                continue
            pano_id, direction, _ = match.groups()
            db_slot = DIRECTION_NORMALIZE.get(direction.lower(), direction.lower())
            grouped.setdefault(pano_id, {})[db_slot] = os.path.join(root, file)

    return grouped


def insert_pano(cur, property_id, pano_id, face_bytes, metadata=None):
    if not face_bytes.get("f") and not face_bytes.get("b"):
        print(f"Skipping panorama {pano_id} - missing required front/back images")
        return None

    if metadata is None:
        metadata = {
            "level": DEFAULT_LEVEL,
            "lat": DEFAULT_LAT,
            "lon": DEFAULT_LON,
            "alt": DEFAULT_ALT,
            "heading_deg": DEFAULT_HEADING,
            "captured_at": datetime.datetime.now()
        }

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
            "level": metadata["level"],
            "source_pano_id": str(pano_id),
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
            face_bytes.get("t"),   # top
            face_bytes.get("d"),   # bottom
            face_bytes.get("f"),   # front
            face_bytes.get("b"),   # back
            face_bytes.get("l"),   # left
            face_bytes.get("r"),   # right
            "image/jpeg",
            sum(len(v) for v in face_bytes.values() if v is not None),
        ),
    )
    return cur.fetchone()[0]


def upload_panoramas(base_dir, csv_path=None):
    try:
        conn = connect_db()
        cur = conn.cursor()
        property_id = ensure_property(cur)

        # Load CSV metadata and top/bottom URLs if provided
        csv_metadata = {}
        if csv_path:
            if not os.path.isfile(csv_path):
                print(f"Warning: CSV file not found: {csv_path}. Skipping CSV loading.")
            else:
                print(f"Loading metadata and top/bottom URLs from CSV: {csv_path}")
                csv_metadata, ud_urls = load_csv_metadata(csv_path)
                print(f"  Found metadata for {len(csv_metadata)} panoramas.")
                print(f"  Found top/bottom URLs for {len(ud_urls)} panoramas.")

                if ud_urls:
                    download_dir = os.path.join(base_dir, "ud_downloads")
                    downloaded = download_ud_images(ud_urls, download_dir)
                    print(f"  Downloaded top/bottom images for {len(downloaded)} panoramas.")

        # Scan local image directory
        print(f"\nScanning directory: {base_dir}")
        grouped = scan_image_dir(base_dir)

        if not grouped:
            print("No matching panorama images found.")
            conn.close()
            return False

        print(f"Found {len(grouped)} panoramas.")

        # Report face coverage
        face_counts = {"t": 0, "d": 0, "f": 0, "b": 0, "l": 0, "r": 0}
        for faces in grouped.values():
            for slot in face_counts:
                if slot in faces:
                    face_counts[slot] += 1
        print("Face coverage:")
        labels = {"t": "top", "d": "bottom", "f": "front", "b": "back", "l": "left", "r": "right"}
        for slot, label in labels.items():
            print(f"  {label:8s}: {face_counts[slot]}/{len(grouped)}")

        success_count = 0
        error_count = 0

        for pano_id, faces in tqdm(grouped.items(), desc="Uploading panoramas"):
            try:
                face_bytes = {k: read_image_bytes(v) for k, v in faces.items()}
                metadata = csv_metadata.get(pano_id)
                result = insert_pano(cur, property_id, pano_id, face_bytes, metadata)
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

        print(f"\nUpload complete. Success: {success_count}, Errors: {error_count}")
        return True

    except Exception as e:
        print(f"Error connecting to database or uploading panoramas: {e}")
        return False


def extract_zip(zip_path):
    extract_dir = tempfile.mkdtemp(prefix="pano_upload_")
    print(f"Extracting zip to temporary directory...")

    with zipfile.ZipFile(zip_path, "r") as z:
        members = z.namelist()

        # Find the _with_ud CSV inside the zip
        csv_member = next(
            (m for m in members if m.endswith(".csv") and "_with_ud" in m),
            None
        )
        # Fall back to any CSV if no _with_ud one found
        if not csv_member:
            csv_member = next((m for m in members if m.endswith(".csv")), None)

        z.extractall(extract_dir)

    csv_path = os.path.join(extract_dir, csv_member) if csv_member else None
    if csv_path:
        print(f"Found CSV in zip: {csv_member}")

    return extract_dir, csv_path


if __name__ == "__main__":
    print("IFC Asset Detection - Panorama Upload Script")
    print("=" * 45)

    raw_input = input("Enter the path to the image folder or zip file: ").strip('"').strip("'")

    temp_dir = None
    folder = None
    csv_file = None

    if raw_input.lower().endswith(".zip") and os.path.isfile(raw_input):
        # Zip file: extract and auto-detect CSV
        temp_dir, csv_file = extract_zip(raw_input)
        # The images live inside the extracted subfolder(s)
        folder = temp_dir
    elif os.path.isdir(raw_input):
        folder = raw_input
        csv_file = input(
            "Enter the path to the _with_ud CSV file (or press Enter to skip): "
        ).strip('"').strip("'")
        csv_file = csv_file if csv_file and os.path.isfile(csv_file) else None
    else:
        print("Invalid path. Provide a directory or a .zip file.")
        exit(1)

    if csv_file:
        print(f"Using CSV: {csv_file}")
    else:
        print("No CSV provided. Using default metadata; top/bottom images will only be "
              "included if present locally.")

    try:
        print(f"Processing images from: {folder}")
        success = upload_panoramas(folder, csv_path=csv_file)
        if success:
            print("Upload process completed.")
        else:
            print("Upload process failed.")
            exit(1)
    finally:
        if temp_dir and os.path.isdir(temp_dir):
            print("Cleaning up temporary files...")
            shutil.rmtree(temp_dir, ignore_errors=True)
