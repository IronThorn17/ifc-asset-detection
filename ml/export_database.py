import os
import hashlib
import psycopg
import cv2
import numpy as np

DB_URL = os.getenv("DB_URL")

OUT = "dataset"


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

                    name = f"pano_{pano_id}_{face}"

                    split = "val" if int(hashlib.md5(name.encode()).hexdigest(), 16) % 10 < 2 else "train"

                    img_path = f"{OUT}/images/{split}/{name}.jpg"
                    lbl_path = f"{OUT}/labels/{split}/{name}.txt"

                    with conn.cursor() as dcur:

                        dcur.execute("""
                        SELECT
                            COALESCE(r.new_class, d.ifc_class) AS effective_class,
                            d.bbox_xywh
                        FROM detections d
                        LEFT JOIN LATERAL (
                            SELECT action, new_class
                            FROM reviews
                            WHERE detection_id = d.id
                            ORDER BY created_at DESC
                            LIMIT 1
                        ) r ON true
                        WHERE d.pano_id = %s
                        AND d.face_id = %s
                        AND (r.action IS NULL OR r.action != 'reject')
                        """, (pano_id, face))

                        detections = dcur.fetchall()

                    if not detections:
                        continue

                    cv2.imwrite(img_path, img)

                    with open(lbl_path, "w") as f:

                        for cls, bbox in detections:

                            if cls not in CLASS_MAP:
                                continue

                            x, y, bw, bh = bbox
                            class_id = CLASS_MAP[cls]

                            f.write(
                                f"{class_id} {x} {y} {bw} {bh}\n"
                            )

    write_data_yaml(OUT, CLASS_MAP)


def write_data_yaml(out_dir, class_map):
    names = [k for k, v in sorted(class_map.items(), key=lambda x: x[1])]
    names_yaml = "[" + ", ".join(names) + "]"
    lines = [
        f"path: {out_dir}",
        "train: images/train",
        "val: images/val",
        f"nc: {len(names)}",
        f"names: {names_yaml}",
    ]
    with open(f"{out_dir}/data.yaml", "w") as f:
        f.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
