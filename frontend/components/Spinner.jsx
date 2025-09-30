export default function Spinner({ show, text = "Loading…" }) {
  if (!show) return null;
  return <div style={S.wrap}>{text}</div>;
}

const S = { wrap: { margin: "8px 0", opacity: 0.9 } };
