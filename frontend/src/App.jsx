import { useEffect, useState } from "react";
import { listDetections, reviewDetection, convertDetectionsToAssets, listAssets } from "./api";
import CubeViewer from "../components/CubeViewer";
import ImageSetPanel from "../components/ImageSetPanel";
import BulkUploadPanel from "../components/BulkUploadPanel";
import PanoJump from "../components/PanoJump";
import DetectionsTable from "../components/DetectionsTable";
import AssetsTable from "../components/AssetsTable";
import ErrorNote from "../components/ErrorNote";
import Spinner from "../components/Spinner";

export default function App() {
  const [panoId, setPanoId] = useState(1);
  const [rows, setRows] = useState([]);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [view, setView] = useState("review"); // 'review' | 'upload' | 'assets'
  const [viewerFaces, setViewerFaces] = useState(null);
  const [conversionLoading, setConversionLoading] = useState(false);

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

  async function loadAssets() {
    try {
      setLoading(true);
      // Get property_id from current panorama
      if (panoId) {
        const response = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/pano/${panoId}`);
        if (response.ok) {
          const panoData = await response.json();
          const assetsData = await listAssets(panoData.property_id);
          setAssets(assetsData);
        }
      }
    } catch (e) {
      setErr(e.message || "Failed to load assets");
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadFaces(panoId) {
    if (!panoId) return null;
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
    const base = `${API_URL}/pano/${panoId}/image`;
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
    async function loadData() {
      if (view === "assets") {
        await loadAssets();
      } else {
        await load(panoId);
        const faces = await loadFaces(panoId);
        setViewerFaces(faces);
      }
    }
    loadData();
  }, [panoId, view]);

  async function handleReview(id, action) {
    try {
      await reviewDetection({ detection_id: id, action });
      await load();
    } catch (e) {
      alert(e.message || "Review failed");
    }
  }

  async function handleConvertToAssets() {
    if (!panoId) return;
    
    try {
      setConversionLoading(true);
      const result = await convertDetectionsToAssets(panoId);
      alert(result.message || "Successfully converted detections to assets!");
      // Reload to show updated data
      await load();
    } catch (e) {
      alert(e.message || "Failed to convert detections to assets");
    } finally {
      setConversionLoading(false);
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
            <button
              onClick={() => setView("assets")}
              style={{
                ...S.navBtn,
                ...(view === "assets" ? S.navActive : {}),
              }}
            >
              <i className="fas fa-cube"></i> Assets
            </button>
          </div>
          {view !== "assets" && (
            <>
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
              {view === "review" && (
                <button
                  onClick={handleConvertToAssets}
                  disabled={!panoId || conversionLoading || loading}
                  style={S.convertBtn}
                >
                  <i className="fas fa-cube"></i> 
                  {conversionLoading ? "Converting..." : "Convert to Assets"}
                </button>
              )}
            </>
          )}
          <Spinner show={loading || conversionLoading} />
        </div>
      </div>

      {/* Main Content */}
      <div style={S.mainContent}>
        {view === "review" ? (
          <>
            <div style={S.primaryColumn}>
              <div style={S.card}>
                <div style={S.sectionHeader}>
                  <h2>3D Panorama Viewer</h2>
                  <div style={S.panoInfo}>
                    {panoId ? `Pano ID: ${panoId}` : "No panorama loaded"}
                  </div>
                </div>
                <div style={S.viewerSquare}>
                  <CubeViewer faces={viewerFaces} detections={rows} />
                </div>
              </div>
            </div>
            <div style={S.secondaryColumn}>
              <div style={{ ...S.card, ...S.flexCard }}>
                <div style={S.sectionHeader}>
                  <h2>Detections</h2>
                </div>
                <ErrorNote err={err} />
                <div style={S.scrollArea}>
                  <DetectionsTable rows={rows} onReview={handleReview} />
                </div>
              </div>
            </div>
          </>
        ) : view === "assets" ? (
          <>
            <div style={S.primaryColumn}>
              <div style={{ ...S.card, ...S.flexCard }}>
                <div style={S.sectionHeader}>
                  <h2>IFC Assets</h2>
                  <div style={S.panoInfo}>
                    {panoId ? `Property ID: ${panoId}` : "No property selected"}
                  </div>
                </div>
                <ErrorNote err={err} />
                <div style={S.scrollArea}>
                  <AssetsTable assets={assets} />
                </div>
              </div>
            </div>
            <div style={S.secondaryColumn}>
              <div style={{ ...S.card, ...S.flexCard }}>
                <div style={S.sectionHeader}>
                  <h2>Asset Information</h2>
                </div>
                <div style={S.infoContent}>
                  <p>Assets are created from confirmed detections.</p>
                  <p>Each asset represents an IFC element identified in the panoramas.</p>
                  <div style={S.assetStats}>
                    <div style={S.statItem}>
                      <span style={S.statLabel}>Total Assets:</span>
                      <span style={S.statValue}>{assets.length}</span>
                    </div>
                    <div style={S.statItem}>
                      <span style={S.statLabel}>Confirmed:</span>
                      <span style={S.statValue}>
                        {assets.filter(a => a.status === 'confirmed').length}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={S.primaryColumn}>
              <div style={{ ...S.card, ...S.flexCard }}>
                <div style={S.sectionHeader}>
                  <h2>Upload Panoramas</h2>
                </div>
                <div style={S.scrollArea}>
                  <ImageSetPanel
                    onLoadSet={(facesWithMeta) => setViewerFaces(facesWithMeta)}
                  />
                </div>
              </div>
            </div>
            <div style={S.secondaryColumn}>
              <div style={{ ...S.card, ...S.flexCard }}>
                <div style={S.sectionHeader}>
                  <h2>Bulk Upload</h2>
                </div>
                <div style={S.scrollArea}>
                  <BulkUploadPanel />
                </div>
              </div>
            </div>
          </>
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
    overflow: "hidden", // Keep viewport fixed; inner panels manage scroll
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
  convertBtn: {
    backgroundColor: "#66bb6a",
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
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
    flex: 1,
    gap: "20px",
    padding: "20px",
    overflowX: "hidden",
    overflowY: "auto",
    minHeight: 0,
  },
  primaryColumn: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    overflow: "hidden",
    minHeight: 0,
  },
  secondaryColumn: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    overflow: "hidden",
    minHeight: 0,
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "10px",
  },
  card: {
    backgroundColor: "rgba(10, 25, 41, 0.85)",
    borderRadius: "12px",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "15px",
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
  },
  flexCard: {
    flex: 1,
    minHeight: 0,
  },
  viewerSquare: {
    width: "100%",
    aspectRatio: "1 / 1",
    maxHeight: "60vh",
    border: "1px solid #2a4d69",
    borderRadius: "12px",
    overflow: "hidden",
    backgroundColor: "#0a1929",
    display: "flex",
  },
  scrollArea: {
    flex: 1,
    overflowY: "auto",
    paddingRight: "6px",
    minHeight: 0,
  },
  infoContent: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "15px",
  },
  assetStats: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    marginTop: "10px",
    padding: "15px",
    backgroundColor: "rgba(30, 58, 95, 0.3)",
    borderRadius: "8px",
  },
  statItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statLabel: {
    fontWeight: "500",
    color: "#bbdefb",
  },
  statValue: {
    fontWeight: "600",
    color: "#4a9bff",
  },
  panoInfo: {
    fontSize: "14px",
    color: "#4a9bff",
    fontWeight: "500",
  },
};