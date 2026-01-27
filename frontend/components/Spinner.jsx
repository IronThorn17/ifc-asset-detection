export default function Spinner({ show, text = "Loading…" }) {
  if (!show) return null;
  return (
    <div style={S.wrap}>
      <div style={S.spinner}>
        <i className="fas fa-spinner fa-spin"></i>
      </div>
      <span style={S.text}>{text}</span>
    </div>
  );
}

const S = {
  wrap: { 
    display: "flex",
    alignItems: "center",
    gap: "8px",
    color: "#4a9bff",
  },
  spinner: {
    fontSize: "1rem",
  },
  text: {
    fontSize: "0.9rem",
    fontWeight: "500",
  },
};