import csv
import os
import uuid
from pathlib import Path
from urllib.request import Request, urlopen

import boto3
import psycopg


ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env"
CSV_PATH = ROOT / "tmp" / "scsu_temp" / "scsu_panorama_ids_dataset_with_ud.csv"


def load_env():
    for raw in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ[k.strip()] = v.strip()


def get_s3():
    return boto3.client(
        "s3",
        region_name=os.getenv("AWS_REGION", "us-east-1"),
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    )


def download_bytes(url: str) -> bytes:
    req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(req, timeout=30) as r:
        return r.read()


def load_ud_links(csv_path: Path):
    links = {}
    with csv_path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            id_with_side = (row.get("id_with_side") or "").strip()
            url = (row.get("url") or "").strip()
            if not id_with_side or "_" not in id_with_side or not url:
                continue
            pano_id, side = id_with_side.rsplit("_", 1)
            side = side.lower()
            if side in ("u", "t"):
                links.setdefault(pano_id, {})["top"] = url
            elif side == "d":
                links.setdefault(pano_id, {})["bottom"] = url
    return links


def main():
    load_env()
    db_url = os.getenv("DATABASE_URL") or os.getenv("DB_URL")
    bucket = os.getenv("AWS_S3_BUCKET")
    if not db_url or not bucket:
        raise RuntimeError("Missing DB url or S3 bucket")
    if not CSV_PATH.exists():
        raise RuntimeError(f"CSV not found: {CSV_PATH}")

    ud_links = load_ud_links(CSV_PATH)
    s3 = get_s3()

    updated = 0
    uploaded = 0
    skipped = 0
    failed = 0

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, faces_json->'meta'->>'source_pano_id' AS source_id, s3_key_top, s3_key_bottom
                FROM panoramas
                ORDER BY id
                """
            )
            rows = cur.fetchall()

        for row in rows:
            pano_row_id, source_id, s3_top, s3_bottom = row
            if not source_id:
                skipped += 1
                continue

            csv_entry = ud_links.get(source_id)
            if not csv_entry:
                skipped += 1
                continue

            set_parts = []
            vals = []

            try:
                if not s3_top and csv_entry.get("top"):
                    b = download_bytes(csv_entry["top"])
                    key = f"uploads/panoramas/imported/pano-{source_id}/top-backfill-{uuid.uuid4().hex[:12]}.jpg"
                    s3.put_object(Bucket=bucket, Key=key, Body=b, ContentType="image/jpeg")
                    set_parts.append("s3_key_top = %s")
                    vals.append(key)
                    uploaded += 1

                if not s3_bottom and csv_entry.get("bottom"):
                    b = download_bytes(csv_entry["bottom"])
                    key = f"uploads/panoramas/imported/pano-{source_id}/bottom-backfill-{uuid.uuid4().hex[:12]}.jpg"
                    s3.put_object(Bucket=bucket, Key=key, Body=b, ContentType="image/jpeg")
                    set_parts.append("s3_key_bottom = %s")
                    vals.append(key)
                    uploaded += 1

                if set_parts:
                    vals.append(pano_row_id)
                    q = f"UPDATE panoramas SET {', '.join(set_parts)} WHERE id = %s"
                    with conn.cursor() as cur:
                        cur.execute(q, vals)
                    updated += 1
                    conn.commit()
            except Exception as e:
                failed += 1
                conn.rollback()
                print(f"[WARN] failed backfill pano_row_id={pano_row_id} source={source_id}: {e}")

    print(
        {
            "updated_panoramas": updated,
            "uploaded_ud_faces": uploaded,
            "skipped": skipped,
            "failed": failed,
        }
    )


if __name__ == "__main__":
    main()

