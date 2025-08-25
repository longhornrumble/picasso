import React from 'react';

export default function SimpleTest() {
  const [count, setCount] = React.useState(0);
  
  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      background: 'white',
      border: '2px solid #4CAF50',
      borderRadius: '8px',
      padding: '20px',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      zIndex: 9999
    }}>
      <h3>Widget Test (No ConfigProvider)</h3>
      <p>Count: {count}</p>
      <button 
        onClick={() => setCount(count + 1)}
        style={{
          background: '#4CAF50',
          color: 'white',
          border: 'none',
          padding: '8px 16px',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        Click Me
      </button>
      <p style={{marginTop: '10px', fontSize: '12px', color: '#666'}}>
        If you see this, React is working!
      </p>
    </div>
  );
}