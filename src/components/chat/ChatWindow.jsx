// src/components/chat/ChatWindow.jsx
import React, { useRef, useLayoutEffect, useState } from "react";
import { useConfig } from "../../context/ConfigProvider";
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
      <div className="flex items-center justify-center h-[500px] w-80 bg-white rounded-xl shadow-lg text-sm text-gray-500">
        Loading bot...
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center h-[500px] w-80 bg-white rounded-xl shadow-lg text-sm text-red-600">
        Failed to load bot config.
      </div>
    );
  }

  const { branding, features } = config;
  const title = config.chat_title || branding?.chat_title || "Chat with Us";
  const headerBg = branding?.header_background_color || "#F3F4F6";
  const headerText = branding?.header_text_color || "#1F2937";

  return (
    <div className="flex flex-col h-[500px] w-80 bg-white rounded-xl shadow-lg overflow-hidden">
      {/* Header */}
      <div
        ref={headerRef}
        className="flex items-center justify-between px-4 py-3 border-b text-sm font-semibold shrink-0"
        style={{ backgroundColor: headerBg, color: headerText }}
      >
        <span>{title}</span>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 transition-colors"
          aria-label="Close chat"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto" style={{ paddingTop: `${headerHeight}px` }}>
        <MessageList />
      </div>

      {/* Footer: Input + Follow-Ups */}
      <div className="border-t bg-white shrink-0">
        <div className="p-3">
          <InputBar />
        </div>
        <div style={{color: 'red', padding: '10px'}}>
          DEBUG features: {JSON.stringify(features)}
        </div>
        <FollowUpPromptBar />
      </div>
    </div>
  );
}