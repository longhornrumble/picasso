import React from "react";
import { useConfig } from "../../hooks/useConfig";
import { X, Settings } from "lucide-react";

export default function ChatHeader({ onClose, onOpenSettings }) {
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

      <div className="chat-header-actions">
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="chat-header-action-button"
            aria-label="Open chat settings"
            title="Chat Settings"
          >
            <Settings size={16} />
          </button>
        )}
        
        <button
          onClick={onClose}
          className="chat-header-close-button"
          aria-label="Close chat"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}