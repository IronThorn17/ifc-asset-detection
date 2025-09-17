import os, time, psycopg

DB_URL = os.getenv("DB_URL", "postgres://postgres:postgres@db:5432/ifc_assets")
POLL_SECS = float(os.getenv("POLL_SECS", "5"))

def latest_pano(conn):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, image_byte_length, image_content_type
            FROM panoramas
            WHERE image IS NOT NULL
            ORDER BY id DESC
            LIMIT 1
        """)
        row = cur.fetchone()
        return row if row else None

def load_image_bytes(conn, pano_id):
    with conn.cursor() as cur:
        cur.execute("SELECT image FROM panoramas WHERE id = %s", (pano_id,))
        row = cur.fetchone()
        return row[0] if row else None

def main():
    print("ML loader (no processing) is running…")
    last_seen = None
    with psycopg.connect(DB_URL) as conn:
        while True:
            row = latest_pano(conn)
            if row:
                pano_id, byte_len, ctype = row
                if pano_id != last_seen:
                    blob = load_image_bytes(conn, pano_id)
                    print(f"[ML] Saw pano #{pano_id} with {byte_len} bytes ({ctype}); loaded={blob is not None}")
                    last_seen = pano_id
            time.sleep(POLL_SECS)

if __name__ == "__main__":
    main()
