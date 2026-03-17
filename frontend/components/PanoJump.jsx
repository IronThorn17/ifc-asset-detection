export default function PanoJump({ panoId, setPanoId, panos, onLoad, loading }) {
  const ids = (panos || []).map((p) => p.id);
  const currentIndex = ids.indexOf(panoId);

  const goPrev = () => {
    if (currentIndex < ids.length - 1) setPanoId(ids[currentIndex + 1]);
  };

  const goNext = () => {
    if (currentIndex > 0) setPanoId(ids[currentIndex - 1]);
  };

  const canPrev = currentIndex < ids.length - 1;
  const canNext = currentIndex > 0;

  return (
    <div style={S.row}>
      <div style={S.inputGroup}>
        <label htmlFor="panoIdInput" style={S.label}>
          <i className="fas fa-search"></i> Pano ID:
        </label>
        <button
          onClick={goPrev}
          disabled={!canPrev || loading}
          style={{ ...S.navBtn, ...(canPrev && !loading ? S.navBtnActive : S.navBtnDisabled) }}
          title="Previous panorama"
        >
          <i className="fas fa-chevron-left"></i>
        </button>
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
          onClick={goNext}
          disabled={!canNext || loading}
          style={{ ...S.navBtn, ...(canNext && !loading ? S.navBtnActive : S.navBtnDisabled) }}
          title="Next panorama"
        >
          <i className="fas fa-chevron-right"></i>
        </button>
        <button
          onClick={onLoad}
          disabled={!panoId || loading}
          style={{ ...S.btn, ...(!panoId || loading ? {} : S.btnActive) }}
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
    gap: "4px",
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
    width: "80px",
    background: "transparent",
    color: "#e0f7fa",
    border: "none",
    padding: "6px 8px",
    fontSize: "0.9rem",
  },
  navBtn: {
    background: "transparent",
    border: "1px solid #2a4d69",
    borderRadius: "4px",
    padding: "4px 7px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "0.75rem",
  },
  navBtnActive: {
    color: "#4a9bff",
    cursor: "pointer",
    borderColor: "#4a9bff",
  },
  navBtnDisabled: {
    color: "#37474f",
    cursor: "not-allowed",
    borderColor: "#1e3a4a",
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
