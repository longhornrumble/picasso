import React from 'react';

const ResponseCard = ({ card }) => {
  if (!card) return null;

  return (
    <div className="response-card" style={{
      padding: '12px',
      margin: '8px 0',
      backgroundColor: '#f8f9fa',
      borderRadius: '8px',
      border: '1px solid #e1e5e9'
    }}>
      {card.title && (
        <h3 style={{
          margin: '0 0 8px 0',
          fontSize: '16px',
          fontWeight: '600',
          color: '#1a1a1a'
        }}>
          {card.title}
        </h3>
      )}

      {card.description && (
        <p style={{
          margin: '0 0 12px 0',
          fontSize: '14px',
          color: '#4a4a4a',
          lineHeight: '1.5'
        }}>
          {card.description}
        </p>
      )}

      {card.fields && card.fields.length > 0 && (
        <div className="card-fields">
          {card.fields.map((field, index) => (
            <div key={index} style={{
              marginBottom: '8px'
            }}>
              <strong style={{
                fontSize: '13px',
                color: '#666'
              }}>
                {field.label}:
              </strong>
              <span style={{
                marginLeft: '8px',
                fontSize: '13px',
                color: '#1a1a1a'
              }}>
                {field.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {card.actions && card.actions.length > 0 && (
        <div className="card-actions" style={{
          marginTop: '12px',
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap'
        }}>
          {card.actions.map((action, index) => (
            <button
              key={index}
              onClick={() => action.handler && action.handler()}
              style={{
                padding: '6px 12px',
                backgroundColor: action.primary ? '#007bff' : '#fff',
                color: action.primary ? '#fff' : '#007bff',
                border: '1px solid #007bff',
                borderRadius: '4px',
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                if (action.primary) {
                  e.target.style.backgroundColor = '#0056b3';
                } else {
                  e.target.style.backgroundColor = '#f0f8ff';
                }
              }}
              onMouseLeave={(e) => {
                if (action.primary) {
                  e.target.style.backgroundColor = '#007bff';
                } else {
                  e.target.style.backgroundColor = '#fff';
                }
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ResponseCard;