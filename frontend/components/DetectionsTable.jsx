import { useState, useEffect, useMemo } from 'react';
import { reviewDetection, updateDetectionBbox, exportDatabase } from "../src/api";

export default function DetectionsTable({ rows: initialRows, onReview, onUpdate, onSelect, editDetectionId }) {
  const [rows, setRows] = useState(initialRows || []);
  const [loadingId, setLoadingId] = useState(null);
  const [error, setError] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortBy, setSortBy] = useState("date_desc");
  const [editingBboxId, setEditingBboxId] = useState(null);
  const [bboxDraft, setBboxDraft] = useState([0.5, 0.5, 0.2, 0.2]);

  useEffect(() => {
    setRows(initialRows || []);
  }, [initialRows]);

  // If a detection id is provided from the 3D viewer, open its bbox editor
  useEffect(() => {
    if (!editDetectionId || !rows || !rows.length) return;
    const target = rows.find((r) => r.id === editDetectionId);
    if (!target) return;
    startEditBbox(target);
    if (onSelect) onSelect(target);
  }, [editDetectionId, rows]);

  const startEditBbox = (row) => {
    setEditingBboxId(row.id);
    const current = Array.isArray(row.bbox_xywh) && row.bbox_xywh.length === 4
      ? row.bbox_xywh
      : [0.5, 0.5, 0.2, 0.2];
    setBboxDraft(current);
  };

  const handleBboxChange = (index, value) => {
    const num = Number(value);
    const safe = Number.isFinite(num) ? Math.max(0, Math.min(1, num)) : 0;
    setBboxDraft((prev) => {
      const next = [...prev];
      next[index] = safe;
      return next;
    });
  };

  const saveBbox = async (detectionId) => {
    try {
      setLoadingId(detectionId);
      setError(null);
      const payload = Array.isArray(bboxDraft) && bboxDraft.length === 4
        ? bboxDraft
        : [0.5, 0.5, 0.2, 0.2];

      const result = await updateDetectionBbox(detectionId, payload);
      const updated = result?.detection || {};

      setRows((prev) =>
        prev.map((r) =>
          r.id === detectionId ? { ...r, bbox_xywh: updated.bbox_xywh || payload } : r
        )
      );
      if (onUpdate) {
        const nextRows = rows.map((r) =>
          r.id === detectionId ? { ...r, bbox_xywh: updated.bbox_xywh || payload } : r
        );
        onUpdate(nextRows);
      }
      setEditingBboxId(null);
    } catch (err) {
      console.error("BBox update failed:", err);
      setError(`Failed to update bounding box: ${err.message}`);
    } finally {
      setLoadingId(null);
    }
  };

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

  const processedRows = useMemo(() => {
    let result = [...rows];

    // Filter
    if (filterStatus !== "all") {
      result = result.filter(r => {
        if (filterStatus === "pending") return !r.review_action;
        return r.review_action === filterStatus;
      });
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case "date_desc":
          return new Date(b.created_at) - new Date(a.created_at);
        case "date_asc":
          return new Date(a.created_at) - new Date(b.created_at);
        case "conf_desc":
          return (b.confidence || 0) - (a.confidence || 0);
        case "conf_asc":
          return (a.confidence || 0) - (b.confidence || 0);
        case "type_asc":
          return (a.ifc_class || "").localeCompare(b.ifc_class || "");
        case "type_desc":
          return (b.ifc_class || "").localeCompare(a.ifc_class || "");
        default:
          return 0;
      }
    });

    return result;
  }, [rows, filterStatus, sortBy]);

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
    <div style={S.container}>
      <div style={S.controls}>
        <div style={S.controlGroup}>
          <label style={S.label}>Status:</label>
          <button onClick={e => exportDatabase()}>
          Export YOLO Dataset
          </button>

          <select 
            value={filterStatus} 
            onChange={e => setFilterStatus(e.target.value)}
            style={S.select}
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="confirm">Accepted</option>
            <option value="reject">Rejected</option>
          </select>
        </div>
        <div style={S.controlGroup}>
          <label style={S.label}>Sort by:</label>
          <select 
            value={sortBy} 
            onChange={e => setSortBy(e.target.value)}
            style={S.select}
          >
            <option value="date_desc">Newest</option>
            <option value="date_asc">Oldest</option>
            <option value="conf_desc">Confidence (High-Low)</option>
            <option value="conf_asc">Confidence (Low-High)</option>
            <option value="type_asc">Type (A-Z)</option>
            <option value="type_desc">Type (Z-A)</option>
          </select>
        </div>
      </div>

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
            {processedRows.map((r) => (
              <tr key={r.id} style={S.trBody} onClick={() => onSelect && onSelect(r)}>
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
                  {editingBboxId === r.id ? (
                    <div style={S.bboxEditor}>
                      {["cx", "cy", "w", "h"].map((label, idx) => (
                        <label key={label} style={S.bboxField}>
                          <span>{label}</span>
                          <input
                            type="number"
                            min="0"
                            max="1"
                            step="0.01"
                            value={
                              bboxDraft[idx]?.toFixed
                                ? bboxDraft[idx].toFixed(2)
                                : bboxDraft[idx]
                            }
                            onChange={(e) => handleBboxChange(idx, e.target.value)}
                            style={S.bboxInput}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </label>
                      ))}
                      <div style={S.bboxButtons}>
                        <button
                          style={S.bboxSave}
                          onClick={(e) => {
                            e.stopPropagation();
                            saveBbox(r.id);
                          }}
                          disabled={loadingId === r.id}
                        >
                          Save
                        </button>
                        <button
                          style={S.bboxCancel}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingBboxId(null);
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : Array.isArray(r.bbox_xywh) ? (
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
                        marginRight: '8px',
                        backgroundColor: "rgba(33, 150, 243, 0.2)",
                        color: "#2196f3"
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect && onSelect(r);
                      }}
                      title="Focus on detection"
                    >
                      <i className="fas fa-eye"></i>
                    </button>
                    <button 
                      style={{
                        ...S.actionButton,
                        ...(r.review_action === 'confirm' ? S.activeButton : {}),
                        opacity: loadingId === r.id && r.review_action !== 'confirm' ? 0.5 : 1,
                        cursor: loadingId === r.id ? 'wait' : 'pointer'
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReview(r.id, 'confirm');
                      }}
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
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReview(r.id, 'reject');
                      }}
                      disabled={loadingId === r.id}
                      title="Reject detection"
                    >
                      <i className="fas fa-times"></i>
                    </button>
                    <button
                      style={{
                        ...S.actionButton,
                        backgroundColor: "rgba(76, 175, 80, 0.15)",
                        color: "#81c784"
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditBbox(r);
                      }}
                      disabled={loadingId === r.id}
                      title="Edit bounding box"
                    >
                      <i className="fas fa-vector-square"></i>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  controls: {
    display: 'flex',
    gap: '20px',
    padding: '10px',
    backgroundColor: 'rgba(30, 58, 95, 0.4)',
    borderRadius: '8px',
    marginBottom: '10px',
  },
  controlGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  label: {
    color: '#bbdefb',
    fontSize: '0.9rem',
    fontWeight: '500',
  },
  select: {
    backgroundColor: 'rgba(13, 27, 42, 0.6)',
    border: '1px solid #2a4d69',
    color: '#e0f7fa',
    padding: '4px 8px',
    borderRadius: '4px',
    outline: 'none',
    cursor: 'pointer',
  },
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
    position: "sticky",
    top: 0,
    zIndex: 1,
  },
  trHead: {
    borderBottom: "1px solid #2a4d69",
  },
  trBody: {
    borderBottom: "1px solid #2a4d69",
    transition: "background-color 0.2s ease",
    cursor: 'pointer',
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
  actionsContainer: {
    display: "flex",
    gap: "8px",
  },
  actionButton: {
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
  activeButton: {
    backgroundColor: "#66bb6a",
    color: "#fff",
  },
  activeRejectButton: {
    backgroundColor: "#ef5350",
    color: "#fff",
  },
  rejectButton: {
    backgroundColor: "rgba(239, 83, 80, 0.2)",
    color: "#ef5350",
  },
  bboxEditor: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  bboxField: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "6px",
    fontSize: "0.8rem",
  },
  bboxInput: {
    width: "70px",
    backgroundColor: "rgba(13, 27, 42, 0.8)",
    border: "1px solid #2a4d69",
    color: "#e0f7fa",
    padding: "2px 4px",
    borderRadius: "4px",
    fontSize: "0.8rem",
  },
  bboxButtons: {
    display: "flex",
    gap: "6px",
    marginTop: "4px",
  },
  bboxSave: {
    padding: "3px 8px",
    borderRadius: "4px",
    border: "none",
    backgroundColor: "#4caf50",
    color: "#fff",
    cursor: "pointer",
    fontSize: "0.8rem",
  },
  bboxCancel: {
    padding: "3px 8px",
    borderRadius: "4px",
    border: "1px solid #2a4d69",
    backgroundColor: "transparent",
    color: "#90a4ae",
    cursor: "pointer",
    fontSize: "0.8rem",
  },
};
