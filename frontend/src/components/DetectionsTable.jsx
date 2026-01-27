import React, { useState } from 'react';

const DetectionsTable = ({ rows, onReview, onUpdate }) => {
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const sortedRows = [...rows].sort((a, b) => {
    const aVal = a[sortBy];
    const bVal = b[sortBy];
    
    if (sortOrder === 'asc') {
      return aVal > bVal ? 1 : -1;
    } else {
      return aVal < bVal ? 1 : -1;
    }
  });

  const handleReview = async (detectionId, action) => {
    try {
      await onReview(detectionId, action);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Review failed:', error);
    }
  };

  if (!rows || rows.length === 0) {
    return (
      <div style={{
        padding: '20px',
        textAlign: 'center',
        color: '#90a4ae',
        fontStyle: 'italic'
      }}>
        No detections found. Upload panoramas and wait for ML processing to complete.
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: 'rgba(10, 25, 41, 0.85)',
      borderRadius: '12px',
      padding: '20px',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
      overflow: 'hidden'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '15px'
      }}>
        <h3 style={{ margin: 0, color: '#bbdefb' }}>
          Detections ({rows.length})
        </h3>
        <div style={{
          fontSize: '12px',
          color: '#90a4ae'
        }}>
          Click column headers to sort
        </div>
      </div>

      <div style={{
        maxHeight: '60vh',
        overflowY: 'auto',
        border: '1px solid #2a4d69',
        borderRadius: '8px'
      }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '14px'
        }}>
          <thead style={{
            backgroundColor: 'rgba(30, 58, 95, 0.3)',
            position: 'sticky',
            top: 0,
            zIndex: 1
          }}>
            <tr>
              <th 
                style={{
                  padding: '12px 8px',
                  textAlign: 'left',
                  color: '#bbdefb',
                  cursor: 'pointer',
                  borderBottom: '1px solid #2a4d69'
                }}
                onClick={() => handleSort('ifc_class')}
              >
                IFC Class {sortBy === 'ifc_class' && (sortOrder === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                style={{
                  padding: '12px 8px',
                  textAlign: 'left',
                  color: '#bbdefb',
                  cursor: 'pointer',
                  borderBottom: '1px solid #2a4d69'
                }}
                onClick={() => handleSort('confidence')}
              >
                Confidence {sortBy === 'confidence' && (sortOrder === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                style={{
                  padding: '12px 8px',
                  textAlign: 'left',
                  color: '#bbdefb',
                  cursor: 'pointer',
                  borderBottom: '1px solid #2a4d69'
                }}
                onClick={() => handleSort('face_id')}
              >
                Face {sortBy === 'face_id' && (sortOrder === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                style={{
                  padding: '12px 8px',
                  textAlign: 'left',
                  color: '#bbdefb',
                  cursor: 'pointer',
                  borderBottom: '1px solid #2a4d69'
                }}
                onClick={() => handleSort('review_action')}
              >
                Status {sortBy === 'review_action' && (sortOrder === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                style={{
                  padding: '12px 8px',
                  textAlign: 'center',
                  color: '#bbdefb',
                  borderBottom: '1px solid #2a4d69'
                }}
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, index) => (
              <tr 
                key={row.id || index}
                style={{
                  backgroundColor: index % 2 === 0 ? 'rgba(10, 25, 41, 0.5)' : 'rgba(10, 25, 41, 0.3)',
                  borderBottom: '1px solid #2a4d69'
                }}
              >
                <td style={{ padding: '12px 8px', color: '#e0e0e0' }}>
                  <div style={{ fontWeight: '600', color: '#4a9bff' }}>
                    {row.ifc_class || 'Unknown'}
                  </div>
                  {row.label_display && (
                    <div style={{ fontSize: '12px', color: '#90a4ae' }}>
                      {row.label_display}
                    </div>
                  )}
                </td>
                <td style={{ padding: '12px 8px', color: '#e0e0e0' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <div style={{
                      width: '60px',
                      height: '8px',
                      backgroundColor: '#2a4d69',
                      borderRadius: '4px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        width: `${(row.confidence || 0) * 100}%`,
                        height: '100%',
                        backgroundColor: row.confidence > 0.7 ? '#66bb6a' : row.confidence > 0.4 ? '#ff9800' : '#f44336',
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                    <span style={{
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#4a9bff',
                      minWidth: '35px'
                    }}>
                      {Math.round((row.confidence || 0) * 100)}%
                    </span>
                  </div>
                </td>
                <td style={{ padding: '12px 8px', color: '#e0e0e0' }}>
                  <span style={{
                    backgroundColor: 'rgba(74, 155, 255, 0.2)',
                    color: '#4a9bff',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: '600'
                  }}>
                    {row.face_id || 'N/A'}
                  </span>
                </td>
                <td style={{ padding: '12px 8px', color: '#e0e0e0' }}>
                  {row.review_action ? (
                    <span style={{
                      backgroundColor: row.review_action === 'confirm' ? 'rgba(102, 187, 106, 0.2)' : 'rgba(244, 67, 54, 0.2)',
                      color: row.review_action === 'confirm' ? '#66bb6a' : '#f44336',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: '600',
                      textTransform: 'uppercase'
                    }}>
                      {row.review_action}
                    </span>
                  ) : (
                    <span style={{
                      backgroundColor: 'rgba(158, 158, 158, 0.2)',
                      color: '#9e9e9e',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: '600',
                      textTransform: 'uppercase'
                    }}>
                      pending
                    </span>
                  )}
                </td>
                <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                  <div style={{
                    display: 'flex',
                    gap: '6px',
                    justifyContent: 'center'
                  }}>
                    <button
                      onClick={() => handleReview(row.id, 'confirm')}
                      disabled={row.review_action === 'confirm'}
                      style={{
                        backgroundColor: row.review_action === 'confirm' ? '#4a4a4a' : '#66bb6a',
                        color: 'white',
                        border: 'none',
                        padding: '6px 12px',
                        borderRadius: '4px',
                        cursor: row.review_action === 'confirm' ? 'not-allowed' : 'pointer',
                        fontSize: '12px',
                        fontWeight: '600',
                        transition: 'all 0.2s ease',
                        opacity: row.review_action === 'confirm' ? 0.6 : 1
                      }}
                      title="Accept detection"
                    >
                      ✓ Accept
                    </button>
                    <button
                      onClick={() => handleReview(row.id, 'reject')}
                      disabled={row.review_action === 'reject'}
                      style={{
                        backgroundColor: row.review_action === 'reject' ? '#4a4a4a' : '#f44336',
                        color: 'white',
                        border: 'none',
                        padding: '6px 12px',
                        borderRadius: '4px',
                        cursor: row.review_action === 'reject' ? 'not-allowed' : 'pointer',
                        fontSize: '12px',
                        fontWeight: '600',
                        transition: 'all 0.2s ease',
                        opacity: row.review_action === 'reject' ? 0.6 : 1
                      }}
                      title="Reject detection"
                    >
                      ✗ Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{
        marginTop: '15px',
        padding: '10px',
        backgroundColor: 'rgba(30, 58, 95, 0.3)',
        borderRadius: '8px',
        fontSize: '12px',
        color: '#90a4ae'
      }}>
        <strong>Tips:</strong>
        <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
          <li>Accept detections that correctly identify IFC elements</li>
          <li>Reject false positives or misidentified objects</li>
          <li>Confirmed detections can be converted to assets</li>
        </ul>
      </div>
    </div>
  );
};

export default DetectionsTable;
