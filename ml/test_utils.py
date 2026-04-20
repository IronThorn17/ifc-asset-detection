import json
import os
import pytest
from utils import normalize_bbox, is_valid_face_column, VALID_FACE_COLUMNS, load_ifc_class_mapping


# --- normalize_bbox ---

def test_normalize_bbox_basic():
    # Box occupies center quarter of a 200x200 image
    result = normalize_bbox(50, 50, 150, 150, 200, 200)
    assert result == pytest.approx([0.5, 0.5, 0.5, 0.5])


def test_normalize_bbox_corner_box():
    # Box in the top-left of the image
    result = normalize_bbox(0, 0, 40, 40, 200, 200)
    assert result == pytest.approx([0.1, 0.1, 0.2, 0.2])


def test_normalize_bbox_non_square_image():
    result = normalize_bbox(0, 0, 100, 50, 400, 200)
    assert result == pytest.approx([0.125, 0.125, 0.25, 0.25])


def test_normalize_bbox_clamps_overflow():
    # Box extends outside image boundaries — values must be clamped to [0, 1]
    result = normalize_bbox(-50, -50, 250, 250, 200, 200)
    for v in result:
        assert 0.0 <= v <= 1.0


def test_normalize_bbox_zero_width_image():
    result = normalize_bbox(10, 10, 50, 50, 0, 200)
    assert result == [0.0, 0.0, 0.0, 0.0]


def test_normalize_bbox_zero_height_image():
    result = normalize_bbox(10, 10, 50, 50, 200, 0)
    assert result == [0.0, 0.0, 0.0, 0.0]


def test_normalize_bbox_zero_dimensions():
    result = normalize_bbox(10, 10, 50, 50, 0, 0)
    assert result == [0.0, 0.0, 0.0, 0.0]


def test_normalize_bbox_returns_four_values():
    result = normalize_bbox(0, 0, 100, 100, 200, 200)
    assert len(result) == 4


# --- is_valid_face_column ---

def test_valid_face_columns_all_pass():
    for col in VALID_FACE_COLUMNS:
        assert is_valid_face_column(col), f"Expected {col} to be valid"


def test_invalid_face_column_name():
    assert not is_valid_face_column("img_invalid")


def test_invalid_face_column_no_prefix():
    assert not is_valid_face_column("front")


def test_invalid_face_column_empty_string():
    assert not is_valid_face_column("")


def test_invalid_face_column_sql_injection():
    assert not is_valid_face_column("img_front; DROP TABLE panoramas")


def test_invalid_face_column_partial_match():
    assert not is_valid_face_column("img_fron")


# --- load_ifc_class_mapping ---

def test_load_ifc_class_mapping_real_file():
    mapping_path = os.path.join(os.path.dirname(__file__), "ifc_class_mapping.json")
    mapping = load_ifc_class_mapping(mapping_path)
    assert isinstance(mapping, dict)
    assert len(mapping) > 0


def test_load_ifc_class_mapping_contains_required_classes():
    mapping_path = os.path.join(os.path.dirname(__file__), "ifc_class_mapping.json")
    mapping = load_ifc_class_mapping(mapping_path)
    required = ["ifcDoor", "ifcWindow", "ifcWall"]
    for cls in required:
        assert cls in mapping, f"Expected class {cls} in mapping"


def test_load_ifc_class_mapping_entry_structure():
    mapping_path = os.path.join(os.path.dirname(__file__), "ifc_class_mapping.json")
    mapping = load_ifc_class_mapping(mapping_path)
    for cls, info in mapping.items():
        assert "category" in info, f"{cls} missing 'category'"
        assert "description" in info, f"{cls} missing 'description'"


def test_load_ifc_class_mapping_missing_file():
    mapping = load_ifc_class_mapping("/nonexistent/path/mapping.json")
    assert mapping == {}


def test_load_ifc_class_mapping_invalid_json(tmp_path):
    bad_file = tmp_path / "bad.json"
    bad_file.write_text("this is not json")
    mapping = load_ifc_class_mapping(str(bad_file))
    assert mapping == {}
