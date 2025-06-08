import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/theme.css";

/**
 * main.jsx
 *
 * Entry point for Picasso frontend.
 * No tenant ID is exposed client-side.
 * Config resolution is handled internally via a secure backend endpoint.
 */

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);