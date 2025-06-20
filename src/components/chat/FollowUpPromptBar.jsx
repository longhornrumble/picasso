import React from "react";
import { useChat } from "../../hooks/useChat";
import { useConfig } from "../../hooks/useConfig";
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

  // Manage animation states for gradual sliding
  const [animationState, setAnimationState] = React.useState('closed'); // 'closed', 'opening', 'open', 'closing'
  const [toggleState, setToggleState] = React.useState('visible'); // 'visible', 'hiding', 'hidden', 'showing'
  
  // Refs for click-outside detection
  const menuRef = React.useRef(null);
  const toggleRef = React.useRef(null);

  const handleOpen = () => {
    setToggleState('hiding');
    setAnimationState('opening');
    // Hide toggle and show menu after toggle starts hiding
    setTimeout(() => {
      setToggleState('hidden');
      setAnimationState('open');
    }, 10);
  };

  const handleClose = () => {
    setAnimationState('closing');
    // Complete close and show toggle after animation duration
    setTimeout(() => {
      setAnimationState('closed');
      setToggleState('showing');
      // Return toggle to visible state after showing animation
      setTimeout(() => setToggleState('visible'), 375);
    }, 375); // Match CSS animation duration
  };

  const handleClick = (prompt) => {
    if (!isTyping) {
      addMessage({ role: "user", content: prompt });
      if (closeAfterSelection) {
        handleClose();
      }
    }
  };

  // Click outside to close menu
  React.useEffect(() => {
    const handleClickOutside = (event) => {
      // Only handle clicks when menu is open
      if (animationState !== 'open') return;
      
      // Check if click is outside both menu and toggle button
      if (
        menuRef.current && 
        toggleRef.current &&
        !menuRef.current.contains(event.target) &&
        !toggleRef.current.contains(event.target)
      ) {
        handleClose();
      }
    };

    // Add event listener when menu is open
    if (animationState === 'open') {
      document.addEventListener('mousedown', handleClickOutside);
    }

    // Cleanup event listener
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [animationState]);

  return (
    <>
      {/* Toggle button - always present with animation states */}
      <div className={`quick-help-toggle-container ${toggleState !== 'visible' ? toggleState : ''}`}>
        <button
          ref={toggleRef}
          onClick={handleOpen}
          className={`quick-help-toggle ${toggleState === 'hiding' ? 'opening' : ''}`}
        >
          {toggleText}
        </button>
      </div>

      {/* Quick help container - present during opening, open, and closing states */}
      {animationState !== 'closed' && (
        <div ref={menuRef} className={`quick-help-container quick-help-${animationState}`}>
          {/* Close button */}
          <button
            onClick={handleClose}
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
      )}
    </>
  );
}