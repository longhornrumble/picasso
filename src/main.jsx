import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/theme.css";
import { setupGlobalErrorHandling } from "./utils/errorHandling";

// Initialize global error handling
setupGlobalErrorHandling();

/**
 * main.jsx
 * 
 * This is the main entry point for the script that runs on the HOST page.
 * Its primary responsibility is to create and inject the initial iframe 
 * that contains the chat widget launcher. It does NOT render the main
 * React application directly. The main application is rendered inside
 * the iframe, with `iframe-main.jsx` as its entry point.
 */
function createWidgetIframe() {
  const container = document.getElementById("root");
  
  // Ensure the container exists
  if (!container) {
    console.error("Picasso Widget: The root container with id 'root' was not found in the DOM.");
    return;
  }
  
  // Inject the iframe. It points to `widget-frame.html`, which is a separate
  // HTML file processed by Vite. Vite will handle injecting the correct
  // scripts and styles into it.
  container.innerHTML = `
    <div style="position: fixed; bottom: 20px; right: 20px; z-index: 9999;">
      <iframe 
        src="widget-frame.html" 
        style="width: 90px; height: 90px; border: none; border-radius: 50%;"
        id="picasso-widget-iframe"
        title="Picasso Chat Widget">
      </iframe>
    </div>
  `;
  
  // Set up message listener for iframe communication
  setupMessageListener();
}

function setupMessageListener() {
  window.addEventListener('message', (event) => {
    const iframe = document.getElementById('picasso-widget-iframe');
    
    // Only handle messages from our iframe
    if (!iframe || event.source !== iframe.contentWindow) return;
    
    if (event.data && event.data.type === 'PICASSO_EVENT') {
      if (event.data.event === 'SIZE_CHANGE') {
        const size = event.data.payload.size;
        const isOpen = event.data.payload.isOpen;
        
        console.log('📐 Widget size change:', size, 'isOpen:', isOpen);
        
        // Adjust iframe size based on widget state
        if (isOpen) {
          iframe.style.width = '360px';
          iframe.style.height = '640px';
          iframe.style.borderRadius = '16px'; // Rounded corners when expanded
        } else {
          iframe.style.width = '90px';
          iframe.style.height = '90px';
          iframe.style.borderRadius = '50%'; // Circular when minimized
        }
      }
    }
  });
}

// This script runs on the host page, so we initialize the iframe.
createWidgetIframe();