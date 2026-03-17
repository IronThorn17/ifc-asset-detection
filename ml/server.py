import os
import threading
import subprocess
from flask import Flask, jsonify
import shared

app = Flask(__name__)

_state = {"status": "idle", "phase": None, "error": None}
_lock = threading.Lock()

EXPORT_OUTPUT_DIR = "/app/dataset"


def _run_retrain():
    result = subprocess.run(
        ["python", "/app/export_database.py"],
        capture_output=True,
        text=True,
        timeout=600,
    )
    if result.returncode != 0:
        with _lock:
            _state["status"] = "error"
            _state["phase"] = "export_failed"
            _state["error"] = result.stderr or "Export failed"
        return

    with _lock:
        _state["phase"] = "training"

    env = {**os.environ, "EXPORT_OUTPUT_DIR": EXPORT_OUTPUT_DIR}
    result2 = subprocess.run(
        ["python", "/app/train.py"],
        capture_output=True,
        text=True,
        timeout=3600,
        env=env,
    )
    if result2.returncode != 0:
        with _lock:
            _state["status"] = "error"
            _state["phase"] = "train_failed"
            _state["error"] = result2.stderr or "Training failed"
        return

    with _lock:
        _state["status"] = "done"
        _state["phase"] = None
        _state["error"] = None

    shared.reload_model.set()


@app.route("/retrain", methods=["POST"])
def retrain():
    with _lock:
        if _state["status"] == "running":
            return jsonify({"ok": False, "error": "Retraining already in progress"}), 409
        _state["status"] = "running"
        _state["phase"] = "exporting"
        _state["error"] = None

    threading.Thread(target=_run_retrain, daemon=True).start()
    return jsonify({"ok": True, "message": "Retraining started"})


@app.route("/retrain/status")
def retrain_status():
    with _lock:
        return jsonify({"ok": True, **_state})


def start():
    app.run(host="0.0.0.0", port=5001, debug=False, use_reloader=False)
