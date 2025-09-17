import { useEffect, useMemo, useState } from "react";
import { listDetections, reviewDetection, ingestPanoramaWithFile } from "./api";

export default function App() {
  const [panoId, setPanoId] = useState(1);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [file, setFile] = useState(null);
  const [level, setLevel] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [heading, setHeading] = useState("");
  const [facesJsonText, setFacesJsonText] = useState("{ }");

  const parsedFaces = useMemo(() => {
    try {
      return facesJsonText.trim() ? JSON.parse(facesJsonText) : {};
    } catch {
      return null;
    }
  }, [facesJsonText]);

  async function load(current = panoId) {
    if (!current) return;
    try {
      setErr("");
      setLoading(true);
      const data = await listDetections(current);
      setRows(data);
    } catch (e) {
      setErr(e.message || "Failed to load");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // const id = setInterval(() => load(), 5000);
    // return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panoId]);

  async function handleUploadAndIngest(e) {
    e.preventDefault();
    if (!file) {
      setErr("Please choose an image.");
      return;
    }
    if (parsedFaces === null) {
      setErr("faces_json is invalid JSON.");
      return;
    }

    try {
      setErr("");
      setLoading(true);

      const ing = await ingestPanoramaWithFile({
        file,
        property_id: propertyId === "" ? null : Number(propertyId),
        level,
        lat,
        lon,
        heading_deg: heading,
        faces_json: parsedFaces || {},
      });

      if (!ing.ok) throw new Error("Ingest failed");

      setPanoId(ing.pano_id);
      await load(ing.pano_id);

      // reset the form
      setFile(null);
      setLevel("");
      setPropertyId("");
      setLat("");
      setLon("");
      setHeading("");
      setFacesJsonText("{ }");
    } catch (e) {
      setErr(e.message || "Upload/ingest failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleReview(id, action) {
    try {
      await reviewDetection({ detection_id: id, action });
      await load();
    } catch (e) {
      alert(e.message || "Review failed");
    }
  }

  return (
    <div
      style={{
        padding: 16,
        fontFamily: "system-ui, sans-serif",
        maxWidth: 960,
        margin: "0 auto",
      }}
    >
      <h2>Detections (pano_id={panoId || "—"})</h2>

      {/* Jump to pano_id */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <label htmlFor="panoIdInput">Jump to pano_id:</label>
        <input
          id="panoIdInput"
          type="number"
          min={1}
          value={panoId ?? ""}
          onChange={(e) => setPanoId(Number(e.target.value) || "")}
          style={{ width: 120 }}
        />
        <button onClick={() => load()} disabled={!panoId || loading}>
          Load
        </button>
      </div>

      {panoId ? (
        <img
          alt="pano preview"
          src={`${import.meta.env.VITE_API_URL}/pano/${panoId}/image`}
          style={{ maxWidth: "100%", margin: "12px 0" }}
        />
      ) : null}

      {/* Upload + optional metadata */}
      <form
        onSubmit={handleUploadAndIngest}
        style={{
          padding: 12,
          border: "1px solid #ddd",
          borderRadius: 8,
          marginBottom: 20,
        }}
      >
        <h3 style={{ marginTop: 0 }}>Add Panorama</h3>

        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
        >
          <div style={{ gridColumn: "1 / span 2" }}>
            <label
              style={{ display: "block", fontWeight: 600, marginBottom: 4 }}
            >
              Image file
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>

          {/* Optional fields — keep them blank-friendly for now */}
          <div>
            <label
              style={{ display: "block", fontWeight: 600, marginBottom: 4 }}
            >
              Property ID (optional)
            </label>
            <input
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              type="number"
              placeholder="e.g., 1"
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <label
              style={{ display: "block", fontWeight: 600, marginBottom: 4 }}
            >
              Level (optional)
            </label>
            <input
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              placeholder="e.g., L1"
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <label
              style={{ display: "block", fontWeight: 600, marginBottom: 4 }}
            >
              Latitude (optional)
            </label>
            <input
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              type="number"
              step="any"
              placeholder="41.8781"
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <label
              style={{ display: "block", fontWeight: 600, marginBottom: 4 }}
            >
              Longitude (optional)
            </label>
            <input
              value={lon}
              onChange={(e) => setLon(e.target.value)}
              type="number"
              step="any"
              placeholder="-87.6298"
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <label
              style={{ display: "block", fontWeight: 600, marginBottom: 4 }}
            >
              Heading ° (optional)
            </label>
            <input
              value={heading}
              onChange={(e) => setHeading(e.target.value)}
              type="number"
              step="any"
              placeholder="90"
              style={{ width: "100%" }}
            />
          </div>

          <div style={{ gridColumn: "1 / span 2" }}>
            <label
              style={{ display: "block", fontWeight: 600, marginBottom: 4 }}
            >
              faces_json (optional)
            </label>
            <textarea
              value={facesJsonText}
              onChange={(e) => setFacesJsonText(e.target.value)}
              rows={4}
              style={{ width: "100%", fontFamily: "ui-monospace, monospace" }}
              placeholder='e.g., {"front":{"yaw":0},"back":{"yaw":180}}'
            />
            {parsedFaces === null && (
              <div style={{ color: "crimson", marginTop: 4 }}>
                Invalid JSON.
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <button
            type="submit"
            disabled={loading || !file || parsedFaces === null}
          >
            {loading ? "Uploading…" : "Upload & Create Panorama"}
          </button>
        </div>
      </form>

      <button onClick={() => load()} disabled={!panoId || loading}>
        Refresh
      </button>

      {loading && <div>Loading…</div>}
      {err && <div style={{ color: "crimson", marginBottom: 12 }}>{err}</div>}
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
