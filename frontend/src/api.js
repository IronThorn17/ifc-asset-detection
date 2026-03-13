const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

export async function listPanoramas() {
  const res = await fetch(`${API}/panoramas`);
  if (!res.ok) throw new Error("Failed to load panoramas");
  return res.json();
}

export async function listDetections(panoId) {
  const res = await fetch(`${API}/detections?pano_id=${panoId}`);
  if (!res.ok) throw new Error("Failed to load detections");
  return res.json();
}

export async function exportDatabase() {
  const res = await fetch(`${API}/ml/export-dataset`,{
    method: "POST"
  });
  
  if (!res.ok) throw new Error("Failed to export");
  return res.json();
}

export async function updateDetectionBbox(detectionId, bbox_xywh) {
  const res = await fetch(`${API}/detection/${detectionId}/bbox`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bbox_xywh }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Failed to update bounding box");
    throw new Error(text || "Failed to update bounding box");
  }
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

export async function convertDetectionsToAssets(panoId) {
  const res = await fetch(`${API}/convert-to-assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pano_id: panoId }),
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => "Conversion failed");
    throw new Error(errorText);
  }
  return res.json();
}

export async function listAssets(propertyId) {
  const url = propertyId 
    ? `${API}/assets?property_id=${propertyId}`
    : `${API}/assets`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to load assets");
  return res.json();
}

// Upload image bytes directly to DB and create panorama row
export async function ingestPanoramaWithFile({
  file,
  property_id,
  level,
  lat,
  lon,
  heading_deg,
  faces_json,
}) {
  const fd = new FormData();
  fd.append("file", file);
  if (property_id !== undefined && property_id !== "")
    fd.append("property_id", property_id);
  if (level) fd.append("level", level);
  if (lat !== undefined && lat !== "") fd.append("lat", lat);
  if (lon !== undefined && lon !== "") fd.append("lon", lon);
  if (heading_deg !== undefined && heading_deg !== "")
    fd.append("heading_deg", heading_deg);
  if (faces_json) fd.append("faces_json", JSON.stringify(faces_json));

  const res = await fetch(`${API}/ingest/pano-file`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || "Ingest failed");
  }
  return res.json();
}

