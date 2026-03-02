"""
Fine-tune YOLO model using exported training data.
Run export_training_data.py first, then this script.
Uses the scsu export dataset + optional existing Datasets for improved accuracy.
"""
import os
import shutil
from pathlib import Path
from ultralytics import YOLO

PROJECT_ROOT = Path(__file__).resolve().parent.parent
EXPORT_DIR = os.getenv("EXPORT_OUTPUT_DIR", str(PROJECT_ROOT / "Datasets" / "scsu_export"))
DATA_YAML = os.path.join(EXPORT_DIR, "data.yaml")
ML_DIR = Path(__file__).resolve().parent
PRETRAINED = os.getenv("PRETRAINED_MODEL", str(ML_DIR / "model" / "best.pt"))
OUTPUT_MODEL = str(ML_DIR / "model" / "best.pt")
EPOCHS = int(os.getenv("TRAIN_EPOCHS", "50"))
IMGSZ = int(os.getenv("TRAIN_IMGSZ", "640"))
BATCH = int(os.getenv("TRAIN_BATCH", "8"))


def main():
    if not os.path.isfile(DATA_YAML):
        print(f"Run export_training_data.py first. Missing {DATA_YAML}")
        return 1

    # Load pretrained model (or base YOLO if not found)
    if os.path.isfile(PRETRAINED):
        model = YOLO(PRETRAINED)
        print(f"Fine-tuning from {PRETRAINED}")
    else:
        model = YOLO("yolov8n.pt")
        print("Pretrained model/best.pt not found, starting from yolov8n.pt")

    results = model.train(
        data=os.path.abspath(DATA_YAML),
        epochs=EPOCHS,
        imgsz=IMGSZ,
        batch=BATCH,
        project="runs/detect",
        name="finetune",
        exist_ok=True,
        pretrained=True,
        optimizer="auto",
        patience=15,
    )

    save_dir = PROJECT_ROOT / "runs" / "detect" / "finetune"
    best_weights = save_dir / "weights" / "best.pt"
    if not best_weights.exists():
        best_weights = Path(results.save_dir) / "weights" / "best.pt" if hasattr(results, "save_dir") else save_dir / "weights" / "best.pt"
    if best_weights.exists():
        (ML_DIR / "model").mkdir(parents=True, exist_ok=True)
        shutil.copy(best_weights, OUTPUT_MODEL)
        print(f"Updated {OUTPUT_MODEL}")
    else:
        print("Training completed but best.pt not found in expected location")

    return 0


if __name__ == "__main__":
    exit(main())
