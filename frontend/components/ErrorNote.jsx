export default function ErrorNote({ err }) {
  if (!err) return null;
  return (
    <div style={S.err}>
      <i className="fas fa-exclamation-triangle"></i>
      <span>{err}</span>
    </div>
  );
}

const S = {
  err: {
    color: "#ef5350",
    backgroundColor: "rgba(239, 83, 80, 0.1)",
    padding: "10px 15px",
    borderRadius: "6px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    border: "1px solid rgba(239, 83, 80, 0.3)",
  },
};