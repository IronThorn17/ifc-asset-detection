import json

VALID_FACE_COLUMNS = frozenset({
    "img_front", "img_back", "img_left",
    "img_right", "img_top", "img_bottom"
})


def normalize_bbox(x1, y1, x2, y2, img_w, img_h):
    """Convert YOLO xyxy coords to normalized center-based xywh, clamped to [0, 1].

    Returns [0, 0, 0, 0] when image dimensions are invalid.
    """
    if img_w <= 0 or img_h <= 0:
        return [0.0, 0.0, 0.0, 0.0]
    box_w = float(x2 - x1)
    box_h = float(y2 - y1)
    cx = float(x1) + box_w / 2
    cy = float(y1) + box_h / 2
    return [
        max(0.0, min(1.0, cx / img_w)),
        max(0.0, min(1.0, cy / img_h)),
        max(0.0, min(1.0, box_w / img_w)),
        max(0.0, min(1.0, box_h / img_h)),
    ]


def is_valid_face_column(col):
    """Return True if col is one of the allowed panorama face column names."""
    return col in VALID_FACE_COLUMNS


def load_ifc_class_mapping(path="ifc_class_mapping.json"):
    """Load IFC class metadata from JSON. Returns empty dict on failure."""
    try:
        with open(path, "r") as f:
            return json.load(f)
    except Exception:
        return {}
