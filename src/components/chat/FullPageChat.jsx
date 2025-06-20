// src/components/chat/FullPageChat.jsx - Full Page Chat Mode
import React, { useState, useEffect } from "react";
import { useConfig } from "../../hooks/useConfig";
import { useChat } from "../../hooks/useChat";
import { useCSSVariables } from "./useCSSVariables";
import ChatHeader from "./ChatHeader";
import MessageList from "./MessageList";
import InputBar from "./InputBar";
import ChatFooter from "./ChatFooter";

export default function FullPageChat() {
  const { config } = useConfig();
  const { messages } = useChat();
  
  // Apply CSS variables for theming
  useCSSVariables(config);
  
  const [input, setInput] = useState("");

  // Set document title and meta for full-page mode
  useEffect(() => {
    if (config?.branding?.chat_title) {
      document.title = config.branding.chat_title;
    }
    
    // Set viewport meta for mobile optimization
    let viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) {
      viewport = document.createElement('meta');
      viewport.name = 'viewport';
      document.head.appendChild(viewport);
    }
    viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
    
    // Set background color on body
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.background = 'var(--background-color, #fafbfc)';
    document.body.style.fontFamily = 'var(--font-family, Inter, sans-serif)';
    
    // Prevent scrolling on body (chat handles its own scrolling)
    document.body.style.overflow = 'hidden';
    
    return () => {
      // Cleanup on unmount
      document.body.style.overflow = '';
    };
  }, [config]);

  // Handle orientation changes for mobile
  useEffect(() => {
    const handleOrientationChange = () => {
      // Force layout recalculation on orientation change
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 100);
    };

    window.addEventListener('orientationchange', handleOrientationChange);
    return () => window.removeEventListener('orientationchange', handleOrientationChange);
  }, []);

  return (
    <div className="fullpage-chat-container">
      {/* Optional: Full-page header with branding */}
      <div className="fullpage-header">
        <ChatHeader 
          onClose={() => {
            // Option 1: Close current tab/window
            if (window.history.length > 1) {
              window.history.back();
            } else {
              window.close();
            }
          }}
          showLogo={true}
          fullPageMode={true}
        />
      </div>

      {/* Main chat area */}
      <div className="fullpage-messages">
        <MessageList 
          enableAutoScroll={true}
          scrollBehavior="smooth"
        />
      </div>

      {/* Input and footer area */}
      <div className="fullpage-input-area">
        <div className="fullpage-input-container">
          <InputBar 
            input={input} 
            setInput={setInput}
            fullPageMode={true}
          />
        </div>
        
        <ChatFooter 
          brandText={config?.branding?.brandText || "AI"}
          fullPageMode={true}
        />
      </div>

      {/* Optional: Powered by branding (smaller in full-page) */}
      <div className="fullpage-branding">
        <span>Powered by {config?.branding?.brandText || "AI"}</span>
      </div>
    </div>
  );
}