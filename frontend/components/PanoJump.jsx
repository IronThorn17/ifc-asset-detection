export default function PanoJump({ panoId, setPanoId, onLoad, loading }) {
  return (
    <div style={S.row}>
      <label htmlFor="panoIdInput">Jump to pano_id:</label>
      <input
        id="panoIdInput"
        type="number"
        min={1}
        value={panoId ?? ""}
        onChange={(e) => setPanoId(Number(e.target.value) || "")}
        style={S.input}
      />
      <button onClick={onLoad} disabled={!panoId || loading}>
        Load
      </button>
    </div>
  );
}

const S = {
  row: { display: "flex", gap: 8, alignItems: "center", marginBottom: 12 },
  input: { width: 120 },
};
