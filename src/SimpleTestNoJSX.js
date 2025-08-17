import { createElement as h, useState } from 'react';

export default function SimpleTestNoJSX() {
  const [count, setCount] = useState(0);
  
  return h('div', {
    style: {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      background: 'white',
      border: '2px solid #4CAF50',
      borderRadius: '8px',
      padding: '20px',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      zIndex: 9999
    }
  },
    h('h3', null, 'Widget Test (No JSX)'),
    h('p', null, `Count: ${count}`),
    h('button', {
      onClick: () => setCount(count + 1),
      style: {
        background: '#4CAF50',
        color: 'white',
        border: 'none',
        padding: '8px 16px',
        borderRadius: '4px',
        cursor: 'pointer'
      }
    }, 'Click Me'),
    h('p', {
      style: {
        marginTop: '10px',
        fontSize: '12px',
        color: '#666'
      }
    }, 'If you see this, React is working without JSX!')
  );
}