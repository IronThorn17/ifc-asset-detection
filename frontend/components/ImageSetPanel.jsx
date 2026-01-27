import { useMemo, useState } from "react";

const FACE_KEYS = ["top", "bottom", "front", "back", "left", "right"];

export default function ImageSetPanel({ onLoadSet }) {
  const [coords, setCoords] = useState({
    lat: "",
    lon: "",
    alt: "",
    area: "",
    timestamp: "",
    property_id: "",
    level: "",
  });
  const [files, setFiles] = useState({});
  const [previews, setPreviews] = useState({});
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);

  const canLoad = useMemo(() => Object.keys(files).length > 0, [files]);

  const handleFile = (face, file) => {
    setFiles((p) => ({ ...p, [face]: file }));
    setPreviews((p) => {
      if (p[face]) URL.revokeObjectURL(p[face]);
      return { ...p, [face]: file ? URL.createObjectURL(file) : undefined };
    });
  };

  const handleLoad = () => {
    if (Object.keys(files).length === 0) return;
    onLoadSet?.({
      top: previews.top,
      bottom: previews.bottom,
      front: previews.front,
      back: previews.back,
      left: previews.left,
      right: previews.right,
      __meta: { ...coords },
    });
    setNote("Loaded into viewer.");
    setTimeout(() => setNote(""), 1200);
  };

  const handleUpload = async () => {
    if (Object.keys(files).length === 0) return;
    try {
      setUploading(true);
      setNote("Uploading image set...");

      const formData = new FormData();
      for (const face of FACE_KEYS) {
        if (files[face]) {
          formData.append(face, files[face]);
        }
      }

      // Attach metadata
      Object.entries(coords).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") {
          formData.append(k, v);
        }
      });

      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
      const res = await fetch(`${API_URL}/ingest/pano-set`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (data.ok) {
        setNote(`Successfully uploaded (pano_id=${data.pano_id})`);
        // Clear files and previews after successful upload
        setFiles({});
        setPreviews({});
        // Clear after a few seconds
        setTimeout(() => setNote(""), 3000);
      } else {
        setNote(`Error: ${data.error || "Upload failed"}`);
      }
    } catch (err) {
      setNote(`Error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={S.wrap}>
      <div style={S.sectionHeader}>
        <h3 style={S.h3}>
          <i className="fas fa-images"></i> Single Panorama Upload
        </h3>
        <p style={S.sectionSubtitle}>Upload all sides of one panorama</p>
      </div>

      <div style={S.coordsSection}>
        <h4 style={S.h4}>
          <i className="fas fa-map-marker-alt"></i> Coordinates
        </h4>
        <div style={S.grid2}>
          <LabeledInput
            label="Latitude"
            type="number"
            step="any"
            value={coords.lat}
            onChange={(v) => setCoords((s) => ({ ...s, lat: v }))}
          />
          <LabeledInput
            label="Longitude"
            type="number"
            step="any"
            value={coords.lon}
            onChange={(v) => setCoords((s) => ({ ...s, lon: v }))}
          />
          <LabeledInput
            label="Altitude (m)"
            type="number"
            step="any"
            value={coords.alt}
            onChange={(v) => setCoords((s) => ({ ...s, alt: v }))}
          />
          <LabeledInput
            label="Area (m²)"
            type="number"
            step="any"
            value={coords.area}
            onChange={(v) => setCoords((s) => ({ ...s, area: v }))}
          />
          <LabeledInput
            label="Timestamp"
            type="datetime-local"
            value={coords.timestamp}
            onChange={(v) => setCoords((s) => ({ ...s, timestamp: v }))}
          />
          <LabeledInput
            label="Property ID"
            type="number"
            value={coords.property_id}
            onChange={(v) => setCoords((s) => ({ ...s, property_id: v }))}
          />
          <LabeledInput
            label="Level"
            type="text"
            value={coords.level}
            onChange={(v) => setCoords((s) => ({ ...s, level: v }))}
          />
        </div>
      </div>

      <div style={S.facesSection}>
        <h4 style={S.h4}>
          <i className="fas fa-cube"></i> Panorama Sides
        </h4>
        <p style={S.facesSubtitle}>Upload all available sides of the panorama together</p>
        <div style={S.faceList}>
          {FACE_KEYS.map((face) => (
            <div key={face} style={S.faceRow}>
              <div style={S.faceInfo}>
                <strong style={S.faceLabel}>{face}</strong>
                {previews[face] && (
                  <span style={S.uploadStatus}>
                    <i className="fas fa-check-circle"></i> Uploaded
                  </span>
                )}
              </div>
              <div style={S.fileInputContainer}>
                <input
                  type="file"
                  accept="image/*"
                  style={S.fileInput}
                  onChange={(e) =>
                    handleFile(face, e.target.files?.[0] || null)
                  }
                />
                <div style={S.fileInputLabel}>
                  <i className="fas fa-upload"></i> Choose File
                </div>
              </div>
              {previews[face] && (
                <img src={previews[face]} alt={face} style={S.thumb} />
              )}
            </div>
          ))}
        </div>
      </div>

      <button
        disabled={!canLoad || uploading}
        onClick={handleUpload}
        style={{
          ...S.btn,
          ...(canLoad && !uploading ? S.btnActive : {}),
          ...(uploading ? S.btnDisabled : {}),
        }}
      >
        {uploading ? (
          <>
            <i className="fas fa-spinner fa-spin"></i> Uploading...
          </>
        ) : (
          <>
            <i className="fas fa-cloud-upload-alt"></i> Upload Panorama
          </>
        )}
      </button>

      {note && (
        <div style={S.note}>
          <i className="fas fa-info-circle"></i> {note}
        </div>
      )}

      <div style={S.helpSection}>
        <p style={S.help}>
          <i className="fas fa-info-circle"></i> Upload all sides of a panorama together to create a 360° view
        </p>
      </div>
    </div>
  );
}

function LabeledInput({ label, onChange, ...rest }) {
  return (
    <label style={S.inputWrap}>
      <span style={S.inputLabel}>{label}</span>
      <input
        {...rest}
        onChange={(e) => onChange(e.target.value)}
        style={S.input}
      />
    </label>
  );
}

const S = {
  wrap: {
    padding: "20px",
    color: "#E2F1E7",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  sectionHeader: {
    marginBottom: "25px",
  },
  h3: {
    margin: "0 0 8px",
    color: "#E2F1E7",
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  sectionSubtitle: {
    margin: 0,
    color: "#90a4ae",
    fontSize: "0.9rem",
  },
  h4: {
    margin: "0 0 15px",
    color: "#bbdefb",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  facesSubtitle: {
    margin: "0 0 15px",
    color: "#90a4ae",
    fontSize: "0.9rem",
    fontStyle: "italic",
  },
  coordsSection: {
    marginBottom: "25px",
    padding: "15px",
    backgroundColor: "rgba(30, 58, 95, 0.3)",
    borderRadius: "8px",
  },
  facesSection: {
    marginBottom: "25px",
  },
  grid2: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "12px",
  },
  faceList: {
    display: "flex",
    flexDirection: "column",
    gap: "15px",
  },
  faceRow: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "12px",
    backgroundColor: "rgba(13, 27, 42, 0.5)",
    borderRadius: "8px",
    border: "1px solid rgba(42, 77, 105, 0.5)",
  },
  faceInfo: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  faceLabel: {
    textTransform: "capitalize",
    color: "#E2F1E7",
    fontWeight: "600",
  },
  uploadStatus: {
    fontSize: "0.8rem",
    color: "#66bb6a",
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  fileInputContainer: {
    position: "relative",
  },
  fileInput: {
    position: "absolute",
    width: "100%",
    height: "100%",
    opacity: 0,
    cursor: "pointer",
  },
  fileInputLabel: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    padding: "8px 12px",
    backgroundColor: "rgba(42, 77, 105, 0.5)",
    color: "#bbdefb",
    borderRadius: "6px",
    border: "1px dashed #2a4d69",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  thumb: {
    height: "60px",
    borderRadius: "6px",
    border: "1px solid #2a4d69",
    marginTop: "5px",
  },
  btn: {
    width: "100%",
    padding: "12px",
    borderRadius: "8px",
    border: "1px solid #243642",
    background: "rgba(56, 116, 120, 0.3)",
    color: "#90a4ae",
    cursor: "not-allowed",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    fontWeight: "600",
    transition: "all 0.3s ease",
  },
  btnActive: {
    background: "linear-gradient(135deg, #4a9bff, #2a4d69)",
    color: "#fff",
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(74, 155, 255, 0.3)",
  },
  btnDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
  note: {
    minHeight: "18px",
    opacity: 0.9,
    marginTop: "15px",
    padding: "10px",
    backgroundColor: "rgba(30, 58, 95, 0.3)",
    borderRadius: "6px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  helpSection: {
    marginTop: "20px",
    padding: "15px",
    backgroundColor: "rgba(30, 58, 95, 0.2)",
    borderRadius: "8px",
  },
  help: {
    opacity: 0.85,
    fontSize: "0.85rem",
    margin: 0,
    display: "flex",
    alignItems: "flex-start",
    gap: "8px",
  },

  inputWrap: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  inputLabel: {
    fontWeight: "500",
    fontSize: "0.9rem",
  },
  input: {
    background: "rgba(30, 58, 95, 0.5)",
    color: "#E2F1E7",
    border: "1px solid #2a4d69",
    borderRadius: "6px",
    padding: "10px 12px",
    transition: "all 0.2s ease",
  },
};
