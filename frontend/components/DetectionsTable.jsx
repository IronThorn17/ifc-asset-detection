export default function DetectionsTable({ rows, onReview }) {
  if (!rows?.length) return <div style={S.empty}>No detections yet.</div>;

  return (
    <table cellPadding={8} style={S.table}>
      <thead>
        <tr style={S.trHead}>
          <th>ID</th>
          <th>Class</th>
          <th>Conf.</th>
          <th>Face</th>
          <th>Box [x,y,w,h]</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} style={S.trBody}>
            <td>#{r.id}</td>
            <td>{r.ifc_class || r.label_display}</td>
            <td>{Math.round((r.confidence || 0) * 100)}%</td>
            <td>{r.face_id}</td>
            <td>{Array.isArray(r.bbox_xywh) ? r.bbox_xywh.join(", ") : ""}</td>
            <td>
              <button onClick={() => onReview(r.id, "confirm")}>Confirm</button>
              <button onClick={() => onReview(r.id, "reject")} style={S.reject}>
                Reject
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const S = {
  empty: { opacity: 0.9 },
  table: {
    borderCollapse: "collapse",
    width: "100%",
    background: "#0f0f0f",
    color: "#eaeaea",
    borderRadius: 8,
  },
  trHead: { textAlign: "left", borderBottom: "1px solid #333" },
  trBody: { borderBottom: "1px solid #222" },
  reject: { marginLeft: 8 },
};
