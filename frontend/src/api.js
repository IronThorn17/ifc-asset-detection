const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

export async function listDetections(panoId) {
  const res = await fetch(`${API}/detections?pano_id=${panoId}`);
  if (!res.ok) throw new Error("Failed to load detections");
  return res.json();
}

export async function reviewDetection({
  detection_id,
  action,
  new_class,
  note,
}) {
  const res = await fetch(`${API}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ detection_id, action, new_class, note }),
  });
  if (!res.ok) throw new Error("Review failed");
  return res.json();
}
