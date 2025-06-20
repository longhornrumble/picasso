import React from "react";
import { useConfig } from "../../hooks/useConfig";
import { X } from "lucide-react";

export default function ChatHeader({ onClose }) {
  const { config } = useConfig();

  // Get subtitle from config with fallback - add null check
  const subtitle = config?.branding?.chat_subtitle || 
                  config?.branding?.header_subtitle || 
                  config?.chat_subtitle ||
                  "How can we help you today?";

  return (
    <div className="chat-header">
      {/* Brand unit: logo + title + subtitle */}
      <div className="chat-header-brand">
        <div className="chat-header-logo" />
        
        <div className="chat-header-text">
          <h3 className="chat-title">{config?.branding?.chat_title || "Chat"}</h3>
          {subtitle && (
            <p className="chat-subtitle">{subtitle}</p>
          )}
        </div>
      </div>

      <button
        onClick={onClose}
        className="chat-header-close-button"
        aria-label="Close chat"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}