import React from "react";
import { useConfig } from "../../context/ConfigProvider";
import { X } from "lucide-react";

export default function ChatHeader({ onClose }) {
  const { config } = useConfig();

  return (
    <div className="chat-header">
      <div className="chat-header-logo" />

      <h3 className="chat-title">{config.branding?.chat_title}</h3>

      <button
        onClick={onClose}
        className="chat-header-close-button p-2 hover:bg-teal-700 rounded-full"
        aria-label="Close chat"
      >
        <X className="w-4 h-4 text-white" />
      </button>
    </div>
  );
}