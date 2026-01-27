import React from "react";

export default function AssetsTable({ assets }) {
  if (!assets || assets.length === 0) {
    return (
      <div style={S.emptyContainer}>
        <div style={S.emptyIcon}>
          <i className="fas fa-cube fa-2x"></i>
        </div>
        <p style={S.emptyText}>No assets found</p>
        <p style={S.emptySubtext}>Convert confirmed detections to create assets</p>
      </div>
    );
  }

  // Function to get category color
  const getCategoryColor = (category) => {
    const colors = {
      "Building Elements": "#4a9bff",
      "Furnishings": "#66bb6a",
      "Electrical": "#ffca28",
      "HVAC": "#26c6da",
      "Technology": "#ab47bc",
      "Automation": "#5c6bc0",
      "Plumbing": "#66bb6a",
      "Mechanical": "#26a69a",
      "Safety": "#ef5350",
      "Unknown": "#90a4ae"
    };
    return colors[category] || colors["Unknown"];
  };

  return (
    <div style={S.tableContainer}>
      <table style={S.table}>
        <thead>
          <tr style={S.trHead}>
            <th style={S.th}>ID</th>
            <th style={S.th}>IFC Class</th>
            <th style={S.th}>Category</th>
            <th style={S.th}>Status</th>
            <th style={S.th}>Property</th>
            <th style={S.th}>Created</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => {
            // Parse attributes to get category info
            let category = "Unknown";
            let description = "";
            if (asset.attributes_json) {
              try {
                const attrs = JSON.parse(asset.attributes_json);
                if (attrs.sphere_coords_json) {
                  category = attrs.sphere_coords_json.category || "Unknown";
                  description = attrs.sphere_coords_json.description || "";
                }
              } catch (e) {
                console.error("Error parsing asset attributes:", e);
              }
            }
            
            return (
              <tr key={asset.id} style={S.trBody}>
                <td style={S.td}>#{asset.id}</td>
                <td style={S.td}>
                  <div style={S.classContainer}>
                    <span style={S.classLabel}>{asset.ifc_class}</span>
                    {description && (
                      <div style={S.description} title={description}>
                        {description.substring(0, 50)}{description.length > 50 ? '...' : ''}
                      </div>
                    )}
                  </div>
                </td>
                <td style={S.td}>
                  <span style={{
                    ...S.categoryBadge,
                    backgroundColor: `${getCategoryColor(category)}20`,
                    color: getCategoryColor(category)
                  }}>
                    {category}
                  </span>
                </td>
                <td style={S.td}>
                  <span style={{
                    ...S.statusBadge,
                    backgroundColor: asset.status === 'confirmed' ? 'rgba(102, 187, 106, 0.2)' :
                                  asset.status === 'rejected' ? 'rgba(239, 83, 80, 0.2)' :
                                  'rgba(74, 155, 255, 0.2)',
                    color: asset.status === 'confirmed' ? '#66bb6a' :
                           asset.status === 'rejected' ? '#ef5350' :
                           '#4a9bff'
                  }}>
                    {asset.status}
                  </span>
                </td>
                <td style={S.td}>{asset.property_name || 'N/A'}</td>
                <td style={S.td}>
                  {new Date(asset.created_at).toLocaleDateString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const S = {
  emptyContainer: {
    textAlign: "center",
    padding: "40px 20px",
    color: "#90a4ae",
  },
  emptyIcon: {
    marginBottom: "15px",
    color: "#546e7a",
  },
  emptyText: {
    fontSize: "1.2rem",
    fontWeight: "500",
    margin: "0 0 5px 0",
  },
  emptySubtext: {
    fontSize: "0.9rem",
    margin: 0,
  },
  tableContainer: {
    overflowX: "hidden",
    borderRadius: "8px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
    maxHeight: "40vh",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    background: "rgba(13, 27, 42, 0.7)",
    color: "#e0f7fa",
  },
  th: {
    background: "rgba(30, 58, 95, 0.8)",
    color: "#bbdefb",
    fontWeight: "600",
    textAlign: "left",
    padding: "15px 12px",
    fontSize: "0.9rem",
  },
  trHead: {
    borderBottom: "1px solid #2a4d69",
  },
  trBody: {
    borderBottom: "1px solid #2a4d69",
    transition: "background-color 0.2s ease",
  },
  td: {
    padding: "12px",
    fontSize: "0.9rem",
  },
  classContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  classLabel: {
    background: "rgba(74, 155, 255, 0.2)",
    padding: "4px 10px",
    borderRadius: "20px",
    fontSize: "0.85rem",
    fontWeight: "500",
  },
  description: {
    fontSize: "0.75rem",
    color: "#90a4ae",
    fontStyle: "italic",
  },
  categoryBadge: {
    padding: "4px 10px",
    borderRadius: "20px",
    fontSize: "0.8rem",
    fontWeight: "500",
  },
  statusBadge: {
    padding: "4px 10px",
    borderRadius: "20px",
    fontSize: "0.8rem",
    fontWeight: "500",
  },
};