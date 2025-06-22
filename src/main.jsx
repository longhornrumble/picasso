import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/theme.css";
import { setupGlobalErrorHandling } from "./utils/errorHandling";

// Initialize global error handling
setupGlobalErrorHandling();

function createWidgetIframe() {
  const container = document.getElementById("root");
  
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

// Create the iframe widget instead of rendering React app
createWidgetIframe();