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
        style="width: 60px; height: 60px; border: none; border-radius: 50%;"
        id="picasso-widget-iframe"
        title="Picasso Chat Widget">
      </iframe>
    </div>
  `;
}

// This script runs on the host page, so we initialize the iframe.
createWidgetIframe();