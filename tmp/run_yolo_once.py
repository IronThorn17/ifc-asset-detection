import json
import os
from pathlib import Path

import boto3
import cv2
import numpy as np
import psycopg
from ultralytics import YOLO


ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env"
MODEL_PATH = ROOT / "ml" / "model" / "best.pt"
MODEL_VERSION = "best.pt"

FACES = ["front", "back", "left", "right", "top", "bottom"]


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


def fetch_image_bytes(s3, bucket, key):
    obj = s3.get_object(Bucket=bucket, Key=key)
    return obj["Body"].read()


def decode_image(image_bytes):
    arr = np.frombuffer(image_bytes, np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def main():
    load_env()
    db_url = os.getenv("DATABASE_URL") or os.getenv("DB_URL")
    bucket = os.getenv("AWS_S3_BUCKET")
    if not db_url or not bucket:
        raise RuntimeError("Missing DB_URL/DATABASE_URL or AWS_S3_BUCKET")

    model = YOLO(str(MODEL_PATH))
    s3 = get_s3()

    inserted = 0
    processed = 0

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, s3_key_front, s3_key_back, s3_key_left, s3_key_right, s3_key_top, s3_key_bottom
                FROM panoramas
                ORDER BY id
                """
            )
            panos = cur.fetchall()

        for row in panos:
            pano_id = row[0]
            keys = dict(zip(FACES, row[1:]))

            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM detections WHERE pano_id = %s AND model_version = %s",
                    (pano_id, MODEL_VERSION),
                )

            for face in FACES:
                key = keys.get(face)
                if not key:
                    continue
                try:
                    img_bytes = fetch_image_bytes(s3, bucket, key)
                    img = decode_image(img_bytes)
                    if img is None:
                        continue
                    h, w = img.shape[:2]
                    results = model(img)[0]
                    for box in results.boxes:
                        cls = int(box.cls)
                        label = model.names[cls]
                        conf = float(box.conf)
                        x1, y1, x2, y2 = box.xyxy.tolist()[0]
                        bw = float(x2 - x1)
                        bh = float(y2 - y1)
                        cx = float(x1 + bw / 2)
                        cy = float(y1 + bh / 2)
                        bbox_xywh = [
                            max(0.0, min(1.0, cx / w)),
                            max(0.0, min(1.0, cy / h)),
                            max(0.0, min(1.0, bw / w)),
                            max(0.0, min(1.0, bh / h)),
                        ]

                        det = {
                            "pano_id": pano_id,
                            "model_version": MODEL_VERSION,
                            "ifc_class": label,
                            "label_display": label.replace("ifc", "IFC ").title(),
                            "confidence": conf,
                            "face_id": face,
                            "bbox_xywh": bbox_xywh,
                            "mask_uri": None,
                            "sphere_coords_json": json.dumps({}),
                        }
                        with conn.cursor() as cur:
                            cur.execute(
                                """
                                INSERT INTO detections (
                                  pano_id, model_version, ifc_class, label_display,
                                  confidence, face_id, bbox_xywh, mask_uri, sphere_coords_json, created_at
                                ) VALUES (
                                  %(pano_id)s, %(model_version)s, %(ifc_class)s, %(label_display)s,
                                  %(confidence)s, %(face_id)s, %(bbox_xywh)s, %(mask_uri)s, %(sphere_coords_json)s, NOW()
                                )
                                """,
                                det,
                            )
                        inserted += 1
                except Exception as e:
                    print(f"[WARN] pano {pano_id} face {face}: {e}")
                    continue

            processed += 1
            if processed % 10 == 0:
                conn.commit()
                print(f"processed={processed}/{len(panos)} inserted={inserted}")

        conn.commit()

    print({"processed_panos": processed, "inserted_detections": inserted})


if __name__ == "__main__":
    main()

