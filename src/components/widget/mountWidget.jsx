// src/components/widget/mountWidget.js
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../App.jsx';

export function mountChatWidget() {
  const container = document.getElementById('root');
  if (!container) {
    console.error('❌ mountWidget: No #root container found.');
    return;
  }

  const root = createRoot(container);
  root.render(<App />);
}