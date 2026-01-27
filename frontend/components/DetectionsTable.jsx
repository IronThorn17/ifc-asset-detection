import { useState } from 'react';
import { reviewDetection } from "../src/api";

export default function DetectionsTable({ rows: initialRows, onReview, onUpdate }) {
  const [rows, setRows] = useState(initialRows || []);
  const [loadingId, setLoadingId] = useState(null);
  const [error, setError] = useState(null);

  const handleReview = async (detectionId, action) => {
    try {
      setLoadingId(detectionId);
      setError(null);
      
      // Optimistic update
      const updatedRows = rows.map(row => 
        row.id === detectionId 
          ? { ...row, review_action: action, isUpdating: true } 
          : row
      );
      setRows(updatedRows);
      
      // Call API
      await reviewDetection({ 
        detection_id: detectionId, 
        action,
        note: `Manually ${action}ed by user`
      });
      
      // Update parent component
      if (onReview) onReview(detectionId, action);
      if (onUpdate) onUpdate(updatedRows);
      
      // Remove loading state
      setRows(prevRows => 
        prevRows.map(row => 
          row.id === detectionId 
            ? { ...row, review_action: action, isUpdating: false } 
            : row
        )
      );
    } catch (err) {
      console.error('Review failed:', err);
      setError(`Failed to ${action} detection: ${err.message}`);
      
      // Revert optimistic update on error
      setRows(prevRows => 
        prevRows.map(row => 
          row.id === detectionId 
            ? { ...row, isUpdating: false } 
            : row
        )
      );
    } finally {
      setLoadingId(null);
    }
  };
  if (!rows?.length) return (
    <div style={S.emptyContainer}>
      <div style={S.emptyIcon}>
        <i className="fas fa-search fa-2x"></i>
      </div>
      <p style={S.emptyText}>No detections found</p>
      <p style={S.emptySubtext}>Upload a panorama to see detections</p>
    </div>
  );

  return (
    <div style={S.tableContainer}>
      <table style={S.table}>
        <thead>
          <tr style={S.trHead}>
            <th style={S.th}>ID</th>
            <th style={S.th}>Class</th>
            <th style={S.th}>Confidence</th>
            <th style={S.th}>Face</th>
            <th style={S.th}>Position</th>
            <th style={S.th}>Status</th>
            <th style={S.th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={S.trBody}>
              <td style={S.td}>#{r.id}</td>
              <td style={S.td}>
                <span style={S.classLabel}>{r.ifc_class || r.label_display}</span>
              </td>
              <td style={S.td}>
                <div style={S.confidenceContainer}>
                  <div style={{
                    ...S.confidenceBar,
                    width: `${(r.confidence || 0) * 100}%`,
                    backgroundColor: (r.confidence || 0) > 0.7 ? '#66bb6a' : 
                                  (r.confidence || 0) > 0.4 ? '#ffca28' : '#ef5350'
                  }}></div>
                  <span style={S.confidenceText}>
                    {Math.round((r.confidence || 0) * 100)}%
                  </span>
                </div>
              </td>
              <td style={S.td}>{r.face_id}</td>
              <td style={S.td}>
                {Array.isArray(r.bbox_xywh) ? (
                  <span style={S.positionBadge}>
                    [{r.bbox_xywh.map(n => n.toFixed(2)).join(', ')}]
                  </span>
                ) : '—'}
              </td>
              <td style={S.td}>
                <StatusBadge status={r.review_action} />
              </td>
              <td style={S.td}>
                <div style={S.actionsContainer}>
                  <button 
                    style={{
                      ...S.actionButton,
                      ...(r.review_action === 'confirm' ? S.activeButton : {}),
                      opacity: loadingId === r.id && r.review_action !== 'confirm' ? 0.5 : 1,
                      cursor: loadingId === r.id ? 'wait' : 'pointer'
                    }}
                    onClick={() => handleReview(r.id, 'confirm')}
                    disabled={loadingId === r.id}
                    title="Accept detection"
                  >
                    <i className="fas fa-check"></i>
                  </button>
                  <button 
                    style={{
                      ...S.actionButton,
                      ...S.rejectButton,
                      ...(r.review_action === 'reject' ? S.activeRejectButton : {}),
                      opacity: loadingId === r.id && r.review_action !== 'reject' ? 0.5 : 1,
                      cursor: loadingId === r.id ? 'wait' : 'pointer'
                    }}
                    onClick={() => handleReview(r.id, 'reject')}
                    disabled={loadingId === r.id}
                    title="Reject detection"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const StatusBadge = ({ status }) => {
  const statusConfig = {
    confirm: { label: 'Accepted', color: '#4caf50', bg: '#e8f5e9' },
    reject: { label: 'Rejected', color: '#f44336', bg: '#ffebee' },
    default: { label: 'Pending', color: '#ff9800', bg: '#fff3e0' }
  };
  
  const { label, color, bg } = statusConfig[status] || statusConfig.default;
  
  return (
    <span style={{
      padding: '4px 8px',
      borderRadius: '12px',
      fontSize: '12px',
      fontWeight: 500,
      color,
      backgroundColor: bg,
      display: 'inline-block',
      minWidth: '80px',
      textAlign: 'center'
    }}>
      {label}
    </span>
  );
};

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
    overflowX: "hidden", // Changed from "auto" to "hidden" to prevent horizontal scrolling
    borderRadius: "8px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
    maxHeight: "40vh", // Limit height to prevent vertical scrolling
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
  classLabel: {
    background: "rgba(74, 155, 255, 0.2)",
    padding: "4px 10px",
    borderRadius: "20px",
    fontSize: "0.85rem",
    fontWeight: "500",
  },
  confidenceContainer: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  confidenceBar: {
    height: "8px",
    borderRadius: "4px",
    backgroundColor: "#546e7a",
    minWidth: "40px",
  },
  confidenceText: {
    minWidth: "40px",
    fontWeight: "500",
  },
  positionBadge: {
    background: "rgba(42, 77, 105, 0.5)",
    padding: "3px 8px",
    borderRadius: "4px",
    fontSize: "0.8rem",
    fontFamily: "monospace",
  },
  actions: {
    display: "flex",
    gap: "8px",
  },
  actionBtn: {
    border: "none",
    width: "32px",
    height: "32px",
    borderRadius: "6px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  confirmBtn: {
    backgroundColor: "rgba(102, 187, 106, 0.2)",
    color: "#66bb6a",
  },
  confirmBtnHover: {
    backgroundColor: "rgba(102, 187, 106, 0.3)",
  },
  rejectBtn: {
    backgroundColor: "rgba(239, 83, 80, 0.2)",
    color: "#ef5350",
  },
  rejectBtnHover: {
    backgroundColor: "rgba(239, 83, 80, 0.3)",
  },
};