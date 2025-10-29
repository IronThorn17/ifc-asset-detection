import { useEffect, useMemo, useState } from "react";
import { listDetections, reviewDetection, ingestPanoramaWithFile } from "./api";
import CubeViewer from "../components/CubeViewer";
import ImageSetPanel from "../components/ImageSetPanel";
import BulkUploadPanel from "../components/BulkUploadPanel";
import PanoJump from "../components/PanoJump";
import DetectionsTable from "../components/DetectionsTable";
import ErrorNote from "../components/ErrorNote";
import Spinner from "../components/Spinner";

export default function App() {
  const [panoId, setPanoId] = useState(1);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [view, setView] = useState("review"); // 'upload' | 'review'

  const [level, setLevel] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");

  const [viewerFaces, setViewerFaces] = useState(null);

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

  async function loadFaces(panoId) {
    if (!panoId) return null;
    const base = `http://localhost:5000/pano/${panoId}/image`;
    return {
      top: `${base}/top`,
      bottom: `${base}/bottom`,
      front: `${base}/front`,
      back: `${base}/back`,
      left: `${base}/left`,
      right: `${base}/right`,
    };
  }

  useEffect(() => {
    load();

    (async () => {
      const faces = await loadFaces(panoId);
      setViewerFaces(faces);
    })();
  }, [panoId]);

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
      {/* Header */}
      <div style={S.header}>
        <h1>IFC Asset Detection</h1>
        <div style={S.headerControls}>
          <div style={S.navTabs}>
            <button
              onClick={() => setView("review")}
              style={{
                ...S.navBtn,
                ...(view === "review" ? S.navActive : {}),
              }}
            >
              <i className="fas fa-check"></i> Review
            </button>
            <button
              onClick={() => setView("upload")}
              style={{
                ...S.navBtn,
                ...(view === "upload" ? S.navActive : {}),
              }}
            >
              <i className="fas fa-upload"></i> Upload
            </button>
          </div>
          <PanoJump
            panoId={panoId}
            setPanoId={setPanoId}
            onLoad={() => load()}
            loading={loading}
          />
          <button
            onClick={() => load()}
            disabled={!panoId || loading}
            style={S.refreshBtn}
          >
            <i className="fas fa-sync-alt"></i> Refresh
          </button>
          <Spinner show={loading} />
        </div>
      </div>

      {/* Main Content */}
      <div style={S.mainContent}>
        {view === "review" ? (
          <div style={S.leftPane}>
            <div style={S.sectionHeader}>
              <h2>3D Panorama Viewer</h2>
              <div style={S.panoInfo}>
                {panoId ? `Pano ID: ${panoId}` : "No panorama loaded"}
              </div>
            </div>
            <div style={S.viewerWrap}>
              <CubeViewer faces={viewerFaces} />
            </div>
            <div style={S.sectionHeader}>
              <h2>Detections</h2>
              <ErrorNote err={err} />
            </div>
            <div style={S.tableWrap}>
              <DetectionsTable rows={rows} onReview={handleReview} />
            </div>
          </div>
        ) : (
          <div style={S.rightPane}>
            <div style={S.sectionHeader}>
              <h2>Upload Panoramas</h2>
            </div>
            <ImageSetPanel onLoadSet={(facesWithMeta) => setViewerFaces(facesWithMeta)} />
            <BulkUploadPanel />
          </div>
        )}
      </div>
    </div>
  );
}

const S = {
  appShell: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    background: "linear-gradient(135deg, #1a2a3a 0%, #0d1b2a 100%)",
    color: "#e0e0e0",
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    overflow: "hidden", // Prevent scrolling on the main app
  },
  header: {
    padding: "20px 30px",
    backgroundColor: "rgba(13, 27, 42, 0.9)",
    borderBottom: "1px solid #2a4d69",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
  },
  headerControls: {
    display: "flex",
    alignItems: "center",
    gap: "15px",
  },
  navTabs: {
    display: "flex",
    gap: "8px",
    marginRight: "10px",
  },
  navBtn: {
    backgroundColor: "transparent",
    color: "#90a4ae",
    border: "1px solid #2a4d69",
    padding: "6px 10px",
    borderRadius: "6px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontWeight: "600",
  },
  navActive: {
    backgroundColor: "#4a9bff",
    color: "white",
    borderColor: "#4a9bff",
  },
  refreshBtn: {
    backgroundColor: "#4a9bff",
    color: "white",
    border: "none",
    padding: "8px 16px",
    borderRadius: "6px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontWeight: "600",
    transition: "all 0.3s ease",
  },
  mainContent: {
    display: "flex",
    flex: 1,
    overflow: "hidden", // Prevent scrolling on main content
  },
  leftPane: {
    flex: 3, // Increase from 2 to 3 to give more space to the viewer
    padding: "20px",
    overflow: "hidden", // Prevent scrolling on left pane
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  rightPane: {
    flex: 1,
    borderLeft: "1px solid #2a4d69",
    backgroundColor: "rgba(26, 42, 58, 0.7)",
    overflow: "auto", // Allow scrolling in the upload section
    padding: "20px",
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "10px",
  },
  viewerWrap: {
    flex: 1,
    minHeight: "70vh", // Increase from 60vh to 70vh for a larger viewer
    border: "1px solid #2a4d69",
    borderRadius: "12px",
    overflow: "hidden",
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
    backgroundColor: "#0a1929",
  },
  tableWrap: {
    backgroundColor: "rgba(26, 42, 58, 0.7)",
    borderRadius: "12px",
    padding: "15px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.2)",
    overflow: "hidden", // Prevent scrolling on table
    maxHeight: "30vh", // Limit table height to ensure viewer gets more space
  },
  panoInfo: {
    fontSize: "14px",
    color: "#4a9bff",
    fontWeight: "500",
  },
};
