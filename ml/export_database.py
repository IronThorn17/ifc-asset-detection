import os
import psycopg
import cv2
import numpy as np
import json
import random

DB_URL = os.getenv("DB_URL")

OUT = "/app/dataset"


CLASS_MAP = {
    "ifcDoor": 0,
    "ifcSign": 1,
    "ifcWall": 2,
    "ifcFurniture": 3,
    "ifcLightFixture": 4,
    "ifcAirTerminal": 5,
    "ifcComputer": 6,
    "ifcSwitchingDevice": 7,
    "ifcSensor": 8,
    "ifcWindow": 9,
    "ifcAudioVisualAppliance": 10,
    "ifcElectricalOutlet": 11,
    "ifcSanitaryTerminal": 12,
    "ifcEquipmentElement": 13,
    "ifcFurnishingElement": 14,
    "ifcDuctSegment": 15,
    "ifcController": 16,
}

faces = [
    "front",
    "back",
    "left",
    "right",
    "top",
    "bottom"
]




def main():

    os.makedirs(f"{OUT}/images/train", exist_ok=True)
    os.makedirs(f"{OUT}/images/val", exist_ok=True)
    os.makedirs(f"{OUT}/labels/train", exist_ok=True)
    os.makedirs(f"{OUT}/labels/val", exist_ok=True)

    with psycopg.connect(DB_URL) as conn:
        with conn.cursor() as cur:

            cur.execute("""
            SELECT id,
                   img_front,
                   img_back,
                   img_left,
                   img_right,
                   img_top,
                   img_bottom
            FROM panoramas
            """)

            panoramas = cur.fetchall()

            for pano in panoramas:

                pano_id = pano[0]
                

                face_images = dict(zip(faces, pano[1:]))

                for face, img_bytes in face_images.items():

                    if img_bytes is None:
                        continue

                    img = cv2.imdecode(
                        np.frombuffer(img_bytes, np.uint8),
                        cv2.IMREAD_COLOR
                    )

                    h, w = img.shape[:2]

                    name = f"pano_{pano_id}_{face}"

                    img_path = f"{OUT}/images/train/{name}.jpg"
                    lbl_path = f"{OUT}/labels/train/{name}.txt"

                    cv2.imwrite(img_path, img)

                    with conn.cursor() as dcur:

                        dcur.execute("""
                        SELECT ifc_class, bbox_xywh
                        FROM detections
                        WHERE pano_id = %s
                        AND face_id = %s
                        """, (pano_id, face))

                        detections = dcur.fetchall()

                    with open(lbl_path, "w") as f:

                        for cls, bbox in detections:

                            x, y, bw, bh = bbox

                            

                            class_id = CLASS_MAP[cls]

                            f.write(
                                f"{class_id} {x} {y} {bw} {bh}\n"
                            )


if __name__ == "__main__":
    main()
