import { useMemo, useState } from "react";

const FACE_KEYS = ["top", "bottom", "front", "back", "left", "right"];

export default function ImageSetPanel({ onLoadSet }) {
  const [coords, setCoords] = useState({
    lat: "",
    lon: "",
    alt: "",
    timestamp: "",
  });
  const [files, setFiles] = useState({});
  const [previews, setPreviews] = useState({});
  const [note, setNote] = useState("");

  const canLoad = useMemo(() => FACE_KEYS.every((k) => !!files[k]), [files]);

  const handleFile = (face, file) => {
    setFiles((p) => ({ ...p, [face]: file }));
    setPreviews((p) => {
      if (p[face]) URL.revokeObjectURL(p[face]);
      return { ...p, [face]: file ? URL.createObjectURL(file) : undefined };
    });
  };

  const handleLoad = () => {
    if (!canLoad) return;
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

  return (
    <div style={S.wrap}>
      <h3 style={S.h3}>Image Set • Coordinates</h3>
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
          label="Timestamp"
          type="datetime-local"
          value={coords.timestamp}
          onChange={(v) => setCoords((s) => ({ ...s, timestamp: v }))}
        />
      </div>

      <h4 style={S.h4}>Six Faces</h4>
      <div style={S.faceList}>
        {FACE_KEYS.map((face) => (
          <div key={face} style={S.faceRow}>
            <strong style={S.faceLabel}>{face}</strong>
            <input
              type="file"
              accept="image/*"
              style={S.btn}
              onChange={(e) => handleFile(face, e.target.files?.[0] || null)}
            />
            {previews[face] && (
              <img src={previews[face]} alt={face} style={S.thumb} />
            )}
          </div>
        ))}
      </div>

      <button disabled={!canLoad} onClick={handleLoad} style={S.btn}>
        Load Into Viewer
      </button>
      <div style={S.note}>{note}</div>

      <hr style={S.hr} />
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
  wrap: { padding: 16, color: "#E2F1E7" },
  h3: { margin: "8px 0 8px", color: "#E2F1E7" },
  h4: { margin: "16px 0 8px" },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  faceList: { display: "grid", gridTemplateColumns: "1fr", gap: 8 },
  faceRow: { display: "flex", alignItems: "center", gap: 8 },
  faceLabel: {
    width: 80,
    textTransform: "capitalize",
    color: "#E2F1E7",
  },
  thumb: { height: 36, borderRadius: 4 },
  btn: {
    marginTop: 12,
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #243642",
    background: "#387478",
    color: "#E2F1E7",
    cursor: "pointer",
  },
  note: { minHeight: 18, opacity: 0.8, marginTop: 6 },
  hr: { borderColor: "#387478", margin: "16px 0" },
  help: { opacity: 0.85, fontSize: 13 },

  inputWrap: { display: "grid", gap: 4 },
  inputLabel: { fontWeight: 600 },
  input: {
    background: "#387478",
    color: "#E2F1E7",
    border: "1px solid #333",
    borderRadius: 6,
    padding: "6px 8px",
  },
};
