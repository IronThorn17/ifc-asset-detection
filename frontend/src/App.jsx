import { useEffect, useState } from "react";
import { listDetections, reviewDetection } from "./api";

const PANO_ID = 1; // adjust later or make this part of your route/query

export default function App() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    try {
      setErr("");
      setLoading(true);
      const data = await listDetections(PANO_ID);
      setRows(data);
    } catch (e) {
      setErr(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 5000); // auto-refresh
    return () => clearInterval(id);
  }, []);

  async function handleReview(id, action) {
    try {
      await reviewDetection({ detection_id: id, action });
      await load();
    } catch (e) {
      alert(e.message || "Review failed");
    }
  }

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h2>Detections (pano_id={PANO_ID})</h2>
      {loading && <div>Loading…</div>}
      {err && <div style={{ color: "crimson" }}>{err}</div>}

      {!loading && rows.length === 0 && <div>No detections yet.</div>}

      {rows.length > 0 && (
        <table
          cellPadding={8}
          style={{ borderCollapse: "collapse", width: "100%" }}
        >
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th>ID</th>
              <th>Class</th>
              <th>Conf.</th>
              <th>Face</th>
              <th>Box [x,y,w,h]</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #eee" }}>
                <td>#{r.id}</td>
                <td>{r.ifc_class || r.label_display}</td>
                <td>{Math.round((r.confidence || 0) * 100)}%</td>
                <td>{r.face_id}</td>
                <td>
                  {Array.isArray(r.bbox_xywh) ? r.bbox_xywh.join(", ") : ""}
                </td>
                <td>
                  <button onClick={() => handleReview(r.id, "confirm")}>
                    Confirm
                  </button>
                  <button
                    onClick={() => handleReview(r.id, "reject")}
                    style={{ marginLeft: 8 }}
                  >
                    Reject
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
