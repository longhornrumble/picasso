// src/components/chat/ChatWindow.jsx
import React, { useRef, useLayoutEffect, useState } from "react";
import { useConfig } from "../../hooks/useConfig";
import MessageList from "./MessageList";
import InputBar from "./InputBar";
import FollowUpPromptBar from "./FollowUpPromptBar";
import { X } from "lucide-react";

export default function ChatWindow({ onClose }) {
  const { config, loading } = useConfig();

  const headerRef = useRef(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  useLayoutEffect(() => {
    if (headerRef.current) {
      setHeaderHeight(headerRef.current.offsetHeight);
    }
  }, []);

  if (loading) {
    return (
      <div className="loading-container">
        Loading bot...
      </div>
    );
  }

  if (!config) {
    return (
      <div className="error-container">
        Failed to load bot config.
      </div>
    );
  }

  const { branding, features } = config;
  const title = config.chat_title || branding?.chat_title || "Chat with Us";

  return (
    <div className="chat-window-container">
      {/* Header */}
      <div
        ref={headerRef}
        className="chat-window-header"
        style={{ 
          '--dynamic-header-bg': branding?.header_background_color || "#F3F4F6",
          '--dynamic-header-color': branding?.header_text_color || "#1F2937"
        }}
      >
        <span>{title}</span>
        <button
          onClick={onClose}
          className="chat-window-header-close"
          aria-label="Close chat"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div 
        className="chat-window-messages padding-top-dynamic" 
        style={{ '--dynamic-padding-top': `${headerHeight}px` }}
      >
        <MessageList />
      </div>

      {/* Footer: Input + Follow-Ups */}
      <div className="chat-window-footer">
        <div className="chat-window-input-area">
          <InputBar />
        </div>
        <div className="debug-info">
          DEBUG features: {JSON.stringify(features)}
        </div>
        <FollowUpPromptBar />
      </div>
    </div>
  );
}