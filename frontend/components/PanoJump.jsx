export default function PanoJump({ panoId, setPanoId, onLoad, loading }) {
  return (
    <div style={S.row}>
      <div style={S.inputGroup}>
        <label htmlFor="panoIdInput" style={S.label}>
          <i className="fas fa-search"></i> Pano ID:
        </label>
        <input
          id="panoIdInput"
          type="number"
          min={1}
          value={panoId ?? ""}
          onChange={(e) => setPanoId(Number(e.target.value) || "")}
          style={S.input}
          placeholder="Enter ID"
        />
        <button 
          onClick={onLoad} 
          disabled={!panoId || loading}
          style={{...S.btn, ...(!panoId || loading ? {} : S.btnActive)}}
        >
          {loading ? (
            <i className="fas fa-spinner fa-spin"></i>
          ) : (
            <i className="fas fa-arrow-right"></i>
          )}
        </button>
      </div>
    </div>
  );
}

const S = {
  row: { 
    display: "flex", 
    alignItems: "center",
  },
  inputGroup: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    background: "rgba(30, 58, 95, 0.5)",
    padding: "5px 10px",
    borderRadius: "8px",
    border: "1px solid #2a4d69",
  },
  label: {
    color: "#bbdefb",
    fontWeight: "500",
    display: "flex",
    alignItems: "center",
    gap: "5px",
    fontSize: "0.9rem",
  },
  input: { 
    width: "100px",
    background: "transparent",
    color: "#e0f7fa",
    border: "none",
    padding: "6px 8px",
    fontSize: "0.9rem",
  },
  btn: {
    background: "transparent",
    border: "none",
    color: "#90a4ae",
    cursor: "not-allowed",
    padding: "6px 10px",
    borderRadius: "4px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  btnActive: {
    color: "#4a9bff",
    cursor: "pointer",
    background: "rgba(74, 155, 255, 0.1)",
  },
};