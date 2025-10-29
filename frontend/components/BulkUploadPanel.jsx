import { useState } from "react";

const FACE_KEYS = ["top", "bottom", "front", "back", "left", "right"];

export default function BulkUploadPanel() {
  const [sets, setSets] = useState([newEmptySet()]);
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);

  function newEmptySet() {
    return {
      coords: {
        lat: "",
        lon: "",
        alt: "",
        area: "",
        timestamp: "",
        property_id: "",
        level: "",
      },
      files: {},
    };
  }

  const addSet = () => setSets((s) => [...s, newEmptySet()]);
  const removeSet = (idx) =>
    setSets((s) => s.filter((_, i) => i !== idx));

  const setCoord = (idx, key, val) =>
    setSets((s) => {
      const copy = [...s];
      copy[idx] = { ...copy[idx], coords: { ...copy[idx].coords, [key]: val } };
      return copy;
    });

  const setFile = (idx, face, file) =>
    setSets((s) => {
      const copy = [...s];
      copy[idx] = { ...copy[idx], files: { ...copy[idx].files, [face]: file } };
      return copy;
    });

  const canUploadAll = () =>
    sets.length > 0 && sets.some((st) => Object.keys(st.files).length > 0);

  async function uploadAll() {
    if (!canUploadAll()) return;
    try {
      setUploading(true);
      setNote("Uploading all sets...");
      let success = 0;
      let errors = 0;
      for (const st of sets) {
        // Skip sets with no files
        if (Object.keys(st.files).length === 0) continue;
        
        try {
          const formData = new FormData();
          for (const face of FACE_KEYS) {
            if (st.files[face]) {
              formData.append(face, st.files[face]);
            }
          }
          Object.entries(st.coords).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== "") {
              formData.append(k, v);
            }
          });
          
          const res = await fetch("http://localhost:5000/ingest/pano-set", {
            method: "POST",
            body: formData,
          });
          
          const data = await res.json();
          if (data.ok) {
            success++;
          } else {
            errors++;
            console.error(`Upload error for set: ${data.error}`);
          }
        } catch (e) {
          errors++;
          console.error(`Network error for set: ${e.message}`);
        }
      }
      if (errors > 0) {
        setNote(`Uploaded ${success}/${sets.length} sets (${errors} failed)`);
      } else {
        setNote(`Uploaded ${success}/${sets.length} sets successfully`);
      }
    } catch (e) {
      setNote(`Error: ${e.message}`);
    } finally {
      setUploading(false);
      setTimeout(() => setNote(""), 5000);
    }
  }

  return (
    <div style={S.wrap}>
      <div style={S.sectionHeader}>
        <h3 style={S.h3}>
          <i className="fas fa-layer-group"></i> Panorama Set Upload
        </h3>
        <p style={S.sectionSubtitle}>Upload all six sides of a panorama together</p>
      </div>

      {sets.map((st, idx) => (
        <div key={idx} style={S.setCard}>
          <div style={S.setHeader}>
            <strong>Panorama Set #{idx + 1}</strong>
            <button onClick={() => removeSet(idx)} style={S.removeBtn}>
              <i className="fas fa-trash"></i> Remove
            </button>
          </div>
          <div style={S.grid2}>
            <LabeledInput
              label="Latitude"
              type="number"
              step="any"
              value={st.coords.lat}
              onChange={(v) => setCoord(idx, "lat", v)}
            />
            <LabeledInput
              label="Longitude"
              type="number"
              step="any"
              value={st.coords.lon}
              onChange={(v) => setCoord(idx, "lon", v)}
            />
            <LabeledInput
              label="Altitude (m)"
              type="number"
              step="any"
              value={st.coords.alt}
              onChange={(v) => setCoord(idx, "alt", v)}
            />
            <LabeledInput
              label="Area (m²)"
              type="number"
              step="any"
              value={st.coords.area}
              onChange={(v) => setCoord(idx, "area", v)}
            />
            <LabeledInput
              label="Timestamp"
              type="datetime-local"
              value={st.coords.timestamp}
              onChange={(v) => setCoord(idx, "timestamp", v)}
            />
            <LabeledInput
              label="Property ID"
              type="number"
              value={st.coords.property_id}
              onChange={(v) => setCoord(idx, "property_id", v)}
            />
            <LabeledInput
              label="Level"
              type="text"
              value={st.coords.level}
              onChange={(v) => setCoord(idx, "level", v)}
            />
          </div>

          <div style={S.faceList}>
            <p style={S.facesTitle}>Panorama Sides (upload all available sides together)</p>
            {FACE_KEYS.map((face) => (
              <div key={face} style={S.faceRow}>
                <div style={S.faceInfo}>
                  <strong style={S.faceLabel}>{face}</strong>
                </div>
                <div style={S.fileInputContainer}>
                  <input
                    type="file"
                    accept="image/*"
                    style={S.fileInput}
                    onChange={(e) => setFile(idx, face, e.target.files?.[0] || null)}
                  />
                  <div style={S.fileInputLabel}>
                    <i className="fas fa-upload"></i> Choose File
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div style={S.actions}>
        <button onClick={addSet} style={S.addBtn}>
          <i className="fas fa-plus"></i> Add Another Panorama Set
        </button>
        <button
          onClick={uploadAll}
          disabled={!canUploadAll() || uploading}
          style={{ ...S.uploadBtn, ...(canUploadAll() && !uploading ? S.uploadActive : {}) }}
        >
          {uploading ? (
            <>
              <i className="fas fa-spinner fa-spin"></i> Uploading...
            </>
          ) : (
            <>
              <i className="fas fa-cloud-upload-alt"></i> Upload All Panorama Sets
            </>
          )}
        </button>
      </div>

      {note && <div style={S.note}>{note}</div>}
    </div>
  );
}

function LabeledInput({ label, onChange, ...rest }) {
  return (
    <label style={S.inputWrap}>
      <span style={S.inputLabel}>{label}</span>
      <input {...rest} onChange={(e) => onChange(e.target.value)} style={S.input} />
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
  sectionHeader: { marginBottom: "20px" },
  h3: { margin: 0, color: "#E2F1E7", display: "flex", alignItems: "center", gap: "8px" },
  sectionSubtitle: { margin: 0, color: "#90a4ae", fontSize: "0.9rem" },
  setCard: {
    padding: "15px",
    backgroundColor: "rgba(13, 27, 42, 0.5)",
    borderRadius: "8px",
    border: "1px solid rgba(42, 77, 105, 0.5)",
    marginBottom: "15px",
  },
  setHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "10px",
  },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" },
  faceList: { display: "flex", flexDirection: "column", gap: "10px", marginTop: "10px" },
  facesTitle: { 
    margin: "0 0 10px 0", 
    color: "#bbdefb", 
    fontSize: "0.9rem",
    fontStyle: "italic"
  },
  faceRow: { display: "flex", flexDirection: "column", gap: "6px" },
  faceInfo: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  faceLabel: { textTransform: "capitalize", color: "#E2F1E7", fontWeight: "600" },
  fileInputContainer: { position: "relative" },
  fileInput: { position: "absolute", width: "100%", height: "100%", opacity: 0, cursor: "pointer" },
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
  },
  actions: { display: "flex", gap: "10px", alignItems: "center", marginTop: "10px" },
  addBtn: {
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid #2a4d69",
    background: "rgba(56, 116, 120, 0.3)",
    color: "#bbdefb",
    cursor: "pointer",
  },
  uploadBtn: {
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid #243642",
    background: "rgba(56, 116, 120, 0.3)",
    color: "#90a4ae",
    cursor: "not-allowed",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontWeight: "600",
  },
  uploadActive: { background: "linear-gradient(135deg, #4a9bff, #2a4d69)", color: "#fff", cursor: "pointer" },
  note: {
    marginTop: "10px",
    padding: "10px",
    backgroundColor: "rgba(30, 58, 95, 0.3)",
    borderRadius: "6px",
  },
  inputWrap: { display: "flex", flexDirection: "column", gap: "6px" },
  inputLabel: { fontWeight: "500", fontSize: "0.9rem" },
  input: {
    background: "rgba(30, 58, 95, 0.5)",
    color: "#E2F1E7",
    border: "1px solid #2a4d69",
    borderRadius: "6px",
    padding: "10px 12px",
  },
};