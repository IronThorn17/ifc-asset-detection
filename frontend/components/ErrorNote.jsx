export default function ErrorNote({ err }) {
  if (!err) return null;
  return <div style={S.err}>{err}</div>;
}

const S = { err: { color: "crimson", margin: "8px 0" } };
