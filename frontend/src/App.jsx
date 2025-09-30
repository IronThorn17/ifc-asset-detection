import { useEffect, useMemo, useState } from "react";
import { listDetections, reviewDetection, ingestPanoramaWithFile } from "./api";
import CubeViewer from "../components/CubeViewer";
import ImageSetPanel from "../components/ImageSetPanel";
import PanoJump from "../components/PanoJump";
import DetectionsTable from "../components/DetectionsTable";
import ErrorNote from "../components/ErrorNote";
import Spinner from "../components/Spinner";

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

  const [viewerFaces, setViewerFaces] = useState(null);

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
    <div style={S.appShell}>
      {/* Left side: viewer + detections */}
      <div style={S.leftPane}>
        <h2>3D Panorama Viewer</h2>
        {/* <h2 style={S.h2}>Detections (pano_id={panoId || "—"})</h2>

        <PanoJump
          panoId={panoId}
          setPanoId={setPanoId}
          onLoad={() => load()}
          loading={loading}
        />

        {panoId ? (
          <img
            alt="pano preview"
            src={`${import.meta.env.VITE_API_URL}/pano/${panoId}/image`}
            style={S.panoPreview}
          />
        ) : null} */}

        <div style={S.viewerWrap}>
          <CubeViewer faces={viewerFaces} />
        </div>

        <div style={S.controlsRow}>
          <button onClick={() => load()} disabled={!panoId || loading}>
            Refresh
          </button>
          <Spinner show={loading} />
          <ErrorNote err={err} />
        </div>

        <div style={S.tableWrap}>
          <DetectionsTable rows={rows} onReview={handleReview} />
        </div>
      </div>

      {/* Right side: upload / six-face set panel */}
      <div style={S.rightPane}>
        <ImageSetPanel
          onLoadSet={(facesWithMeta) => setViewerFaces(facesWithMeta)}
        />
      </div>
    </div>
  );
}

const S = {
  appShell: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr",
    height: "98vh",
  },
  leftPane: {
    padding: 12,
    overflow: "auto",
    borderRadius: 8,
    background: "#243642",
    color: "#eee",
    margin: 2,
  },
  rightPane: {
    borderLeft: "1px solid #243642",
    borderRadius: 8,
    background: "#243642",
    overflow: "auto",
    margin: 2,
  },
  h2: { margin: "0 0 8px 0", color: "#E2F1E7" },
  panoPreview: { maxWidth: "100%", margin: "8px 0", borderRadius: 8 },
  viewerWrap: {
    height: "75vh",
    border: "1px solid #222",
    borderRadius: 8,
    overflow: "hidden",
  },
  controlsRow: { marginTop: 12, display: "flex", alignItems: "center", gap: 8 },
  tableWrap: { marginTop: 12 },
};

// color pallete
// 243642
// 387478
// 629584
// E2F1E7
