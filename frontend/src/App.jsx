import { useEffect, useState, useRef } from "react";
import { listDetections, reviewDetection, convertDetectionsToAssets, listAssets, listPanoramas, triggerRetraining, getRetrainStatus } from "./api";
import CubeViewer from "../components/CubeViewer";
import ImageSetPanel from "../components/ImageSetPanel";
import BulkUploadPanel from "../components/BulkUploadPanel";
import PanoJump from "../components/PanoJump";
import DetectionsTable from "../components/DetectionsTable";
import AssetsTable from "../components/AssetsTable";
import ErrorNote from "../components/ErrorNote";
import Spinner from "../components/Spinner";

export default function App() {
  const [panoId, setPanoId] = useState(null);
  const [panos, setPanos] = useState([]);
  const [rows, setRows] = useState([]);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [view, setView] = useState("review"); // 'review' | 'upload' | 'assets'
  const [viewerFaces, setViewerFaces] = useState(null);
  const [conversionLoading, setConversionLoading] = useState(false);
  const [convertNote, setConvertNote] = useState("");
  const [minConf, setMinConf] = useState(0.05);
  const [showLabels, setShowLabels] = useState(true);
  const [focusedDetection, setFocusedDetection] = useState(null);
  const [editDetectionId, setEditDetectionId] = useState(null);
  const [retrain, setRetrain] = useState({ status: "idle", phase: null, error: null });

  const pollInterval = useRef(null);
  const retrainPollRef = useRef(null);

  useEffect(() => {
    // Initial fetch of panoramas to find the latest one
    listPanoramas()
      .then((list) => {
        setPanos(list);
        if (list.length > 0) setPanoId(list[0].id);
        else console.warn("No panoramas found");
      })
      .catch((e) => console.error("Failed to list panoramas:", e));
  }, []);

  async function load(current = panoId, quiet = false) {
    if (!current) return;
    try {
      setErr("");
      if (!quiet) setLoading(true);
      const data = await listDetections(current);
      setRows(data);
    } catch (e) {
      setErr(e.message || "Failed to load");
      setRows([]);
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  async function loadAssets() {
    try {
      setLoading(true);
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

  async function loadFaces(currentPanoId) {
    if (!currentPanoId) return;
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
    
    try {
      // First, get the panorama data to see which faces exist
      const panoRes = await fetch(`${API_URL}/pano/${currentPanoId}`);
      if (!panoRes.ok) {
        console.error("Failed to fetch panorama data");
        // Ensure viewer renders even when pano is missing
        setViewerFaces({});
        return;
      }
      
      const panoData = await panoRes.json();
      const availableFaces = {};
      
      // Only include faces that have a non-null value in the database
      if (panoData.img_top) availableFaces.top = `${API_URL}/pano/${currentPanoId}/image/top`;
      if (panoData.img_bottom) availableFaces.bottom = `${API_URL}/pano/${currentPanoId}/image/bottom`;
      if (panoData.img_front) availableFaces.front = `${API_URL}/pano/${currentPanoId}/image/front`;
      if (panoData.img_back) availableFaces.back = `${API_URL}/pano/${currentPanoId}/image/back`;
      if (panoData.img_left) availableFaces.left = `${API_URL}/pano/${currentPanoId}/image/left`;
      if (panoData.img_right) availableFaces.right = `${API_URL}/pano/${currentPanoId}/image/right`;
      
      setViewerFaces(availableFaces);
      
      // Log available faces for debugging
      console.log('Available faces:', Object.keys(availableFaces));
    } catch (e) {
      console.error("Error loading panorama faces:", e);
      setViewerFaces({});
    }
  }

  useEffect(() => {
    return () => {
      clearInterval(pollInterval.current);
      clearInterval(retrainPollRef.current);
    };
  }, []);

  useEffect(() => {
    async function loadData() {
      if (view === "assets") {
        await loadAssets();
      } else {
        await load(panoId);
        await loadFaces(panoId);

        // Clear previous interval and start polling for new detections
        clearInterval(pollInterval.current);
        pollInterval.current = setInterval(() => {
          load(panoId, true); // Quietly poll in the background
        }, 5000); // Poll every 5 seconds
      }
    }
    loadData();
  }, [panoId, view]);

  const handleReview = async (detectionId, action) => {
    // API call is handled by DetectionsTable
    // We just need to refresh the data eventually to ensure consistency
    try {
      // Refresh the data silently
      await load(panoId, true);
    } catch (e) {
      console.error('Refresh failed:', e);
    }
  };
  
  // Update the detections when they change
  const handleDetectionsUpdate = (updatedDetections) => {
    setRows(updatedDetections);
  };

  async function handleRetrain() {
    try {
      await triggerRetraining();
      setRetrain({ status: "running", phase: "exporting", error: null });

      clearInterval(retrainPollRef.current);
      retrainPollRef.current = setInterval(async () => {
        try {
          const s = await getRetrainStatus();
          setRetrain({ status: s.status, phase: s.phase, error: s.error });
          if (s.status === "done" || s.status === "error") {
            clearInterval(retrainPollRef.current);
          }
        } catch {
          clearInterval(retrainPollRef.current);
        }
      }, 4000);
    } catch (e) {
      setRetrain({ status: "error", phase: null, error: e.message });
    }
  }

  async function handleConvertToAssets() {
    if (!panoId) return;
    try {
      setConversionLoading(true);
      setConvertNote("");
      const result = await convertDetectionsToAssets(panoId);
      setConvertNote(result.message || "Converted detections to assets");
      setTimeout(() => setConvertNote(""), 5000);
      await load();
    } catch (e) {
      setConvertNote(e.message || "Failed to convert detections to assets");
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
                panos={panos}
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
          <button
            onClick={handleRetrain}
            disabled={retrain.status === "running"}
            style={{
              ...S.retrainBtn,
              ...(retrain.status === "error" ? S.retrainBtnError : {}),
              ...(retrain.status === "done" ? S.retrainBtnDone : {}),
            }}
            title={retrain.error || undefined}
          >
            <i className="fas fa-brain"></i>
            {retrain.status === "running"
              ? retrain.phase === "training" ? "Training..." : "Exporting..."
              : retrain.status === "done"
              ? "Retrain Done"
              : retrain.status === "error"
              ? "Retrain Failed"
              : "Retrain Model"}
          </button>
          <Spinner show={loading || conversionLoading} />
        </div>
        {convertNote && (
          <div style={S.convertNote}>{convertNote}</div>
        )}
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
                  <CubeViewer 
                    faces={viewerFaces} 
                    detections={rows}
                    minConfidence={minConf}
                    showLabels={showLabels}
                    focusedDetection={focusedDetection}
                    onDetectionClick={(det) => {
                      if (!det) return;
                      setFocusedDetection(det);
                      // Ask table to open bbox editor for this detection
                      setEditDetectionId(det.id ?? null);
                    }}
                  />
                </div>
                <div style={S.viewerControls}>
                  <label style={S.ctrlLabel}>
                    Min confidence
                    <input 
                      type="range" 
                      min={0} max={1} step={0.01}
                      value={minConf}
                      onChange={(e) => setMinConf(parseFloat(e.target.value))}
                      style={S.ctrlRange}
                    />
                    <span style={S.ctrlValue}>{minConf.toFixed(2)}</span>
                  </label>
                  <label style={S.ctrlLabelRow}>
                    <input 
                      type="checkbox"
                      checked={showLabels}
                      onChange={(e) => setShowLabels(e.target.checked)}
                    />
                    <span>Show labels</span>
                  </label>
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
                  <DetectionsTable 
                    rows={rows} 
                    onReview={handleReview} 
                    onUpdate={handleDetectionsUpdate}
                    onSelect={(det) => {
                      setFocusedDetection(det);
                      // If user selects from table, don't force an edit panel
                      setEditDetectionId(null);
                    }}
                    // When coming from 3D viewer, this id will cause bbox editor to open
                    editDetectionId={editDetectionId}
                  />
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
    padding: "12px 30px",
    backgroundColor: "rgba(13, 27, 42, 0.9)",
    borderBottom: "1px solid #2a4d69",
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "6px",
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
  retrainBtn: {
    backgroundColor: "#7b5ea7",
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
  retrainBtnError: {
    backgroundColor: "#c62828",
  },
  retrainBtnDone: {
    backgroundColor: "#2e7d32",
  },
  convertNote: {
    fontSize: "0.85rem",
    color: "#bbdefb",
    padding: "4px 12px",
    backgroundColor: "rgba(30, 58, 95, 0.6)",
    borderRadius: "4px",
    alignSelf: "center",
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
  viewerControls: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginTop: "10px",
  },
  ctrlLabel: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    color: "#bbdefb",
  },
  ctrlLabelRow: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    color: "#bbdefb",
  },
  ctrlRange: {
    width: "160px",
  },
  ctrlValue: {
    minWidth: "40px",
    textAlign: "right",
    color: "#4a9bff",
    fontWeight: "600",
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