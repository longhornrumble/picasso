import React from "react";
import { useChat } from "../../context/ChatProvider";
import { useConfig } from "../../context/ConfigProvider";
import { X } from "lucide-react";

export default function FollowUpPromptBar() {
  const { addMessage, isTyping } = useChat();
  const { config } = useConfig();

  // Use new config structure for quick help
  const quickHelpConfig = config?.quick_help || {};
  const enabled = quickHelpConfig.enabled !== false; // Default to true
  
  if (!enabled) return null;

  // Get all config values from quick_help section
  const prompts = quickHelpConfig.prompts || [
    "Tell me about volunteering",
    "Where does my donation go?",
    "How can I get involved?",
    "What volunteer opportunities are available?",
    "How can I make a donation?",
    "What impact does my support have?"
  ];
  
  const title = quickHelpConfig.title || "Common Questions:";
  const toggleText = quickHelpConfig.toggle_text || "Help Menu ↑";
  const closeAfterSelection = quickHelpConfig.close_after_selection !== false; // Default to true

  // Manage open/closed state for drawer
  const [open, setOpen] = React.useState(false);

  // Toggle button - pure CSS classes only
  if (!open) {
    return (
      <div className="quick-help-toggle-container">
        <button
          onClick={() => setOpen(true)}
          className="quick-help-toggle"
        >
          {toggleText}
        </button>
      </div>
    );
  }

  const handleClick = (prompt) => {
    if (!isTyping) {
      addMessage({ role: "user", content: prompt });
      if (closeAfterSelection) {
        setOpen(false); // Close drawer after selection based on config
      }
    }
  };

  return (
    <div className="quick-help-container">
      {/* Close button with pure CSS classes */}
      <button
        onClick={() => setOpen(false)}
        className="quick-help-close"
        aria-label="Close quick help"
      >
        <X size={14} />
      </button>

      {/* Header with configurable title */}
      <div className="quick-help-header">
        <div className="quick-help-title">{title}</div>
      </div>

      {/* Grid with configurable prompts */}
      <div className="quick-help-grid">
        {prompts.map((prompt, i) => (
          <button
            key={i}
            onClick={() => handleClick(prompt)}
            className="quick-help-button"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}