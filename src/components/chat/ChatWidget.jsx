// src/components/chat/ChatWidget.jsx - UPDATED with localStorage state persistence
import React, { useState, useEffect, useRef } from "react";
import { MessagesSquare, X } from "lucide-react";
import { useChat } from "../../context/ChatProvider";
import { useConfig } from "../../context/ConfigProvider";
import { useCSSVariables } from "./useCSSVariables";
import ChatHeader from "./ChatHeader";
import InputBar from "./InputBar";
import ChatFooter from "./ChatFooter";
import AttachmentMenu from "./AttachmentMenu";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";

export default function ChatWidget() {
  const { messages, isTyping } = useChat();
  const { config } = useConfig();
  
  // Apply CSS variables for theming
  useCSSVariables(config);
  
  // UPDATED: Chat state with localStorage persistence using lazy initialization
  const [isOpen, setIsOpen] = useState(() => {
    const widgetConfig = config?.widget_behavior || {};
    
    // If remember_state is disabled, use config default
    if (!widgetConfig.remember_state) {
      return widgetConfig.start_open || false;
    }
    
    // Check for saved state in localStorage
    try {
      const savedState = localStorage.getItem(`picasso_chat_state_${config?.tenant_id}`);
      if (savedState !== null) {
        return JSON.parse(savedState);
      }
    } catch (error) {
      console.warn('Failed to parse saved chat state:', error);
    }
    
    // First visit - use config default
    return widgetConfig.start_open || false;
  });
  
  const [input, setInput] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [showCallout, setShowCallout] = useState(false);
  const [calloutDismissed, setCalloutDismissed] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  
  // FIXED: Track last read message to properly handle unread count
  const [lastReadMessageIndex, setLastReadMessageIndex] = useState(0);
  
  // FIXED: Track if user has ever opened chat in this session
  const [hasOpenedChat, setHasOpenedChat] = useState(false);

  // NEW: Save chat state to localStorage when it changes
  useEffect(() => {
    const widgetConfig = config?.widget_behavior || {};
    
    if (widgetConfig.remember_state && config?.tenant_id) {
      try {
        localStorage.setItem(
          `picasso_chat_state_${config.tenant_id}`, 
          JSON.stringify(isOpen)
        );
      } catch (error) {
        console.warn('Failed to save chat state to localStorage:', error);
      }
    }
  }, [isOpen, config?.widget_behavior?.remember_state, config?.tenant_id]);

  // NEW: Auto-open delay functionality
  useEffect(() => {
    const widgetConfig = config?.widget_behavior || {};
    
    if (!isOpen && widgetConfig.auto_open_delay > 0) {
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, widgetConfig.auto_open_delay);
      
      return () => clearTimeout(timer);
    }
  }, [config?.widget_behavior?.auto_open_delay, isOpen]);

  // Add/remove `chat-open` class on body when chat opens/closes
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add("chat-open");
    } else {
      document.body.classList.remove("chat-open");
    }
  }, [isOpen]);

  // Auto-close attachment menu if photo_uploads flips to false
  useEffect(() => {
    if (!config?.features?.photo_uploads && showAttachmentMenu) {
      setShowAttachmentMenu(false);
    }
  }, [config?.features?.photo_uploads, showAttachmentMenu]);
  
  // Auto-scroll refs
  const chatWindowRef = useRef(null);
  const lastMessageRef = useRef(null);

  // Get chat title
  const chat_title = config?.chat_title || 
                    config?.branding?.chat_title || 
                    (config?.tenant_id === "FOS402334" ? "Foster Village" : "Chat");

  // Auto-scroll function - scroll to start of latest message with slower speed
  const scrollToLatestMessage = () => {
    if (lastMessageRef.current) {
      const chatWindow = chatWindowRef.current;
      if (chatWindow) {
        chatWindow.style.scrollBehavior = 'auto';
        
        const targetElement = lastMessageRef.current;
        const targetPosition = targetElement.offsetTop - chatWindow.offsetTop;
        const startPosition = chatWindow.scrollTop;
        const distance = targetPosition - startPosition;
        const duration = 800; // Slower duration (was instant/default)
        
        let start = null;
        
        const animateScroll = (timestamp) => {
          if (!start) start = timestamp;
          const progress = timestamp - start;
          const percentage = Math.min(progress / duration, 1);
          
          // Ease-out function for smoother deceleration
          const easeOut = 1 - Math.pow(1 - percentage, 3);
          
          chatWindow.scrollTop = startPosition + (distance * easeOut);
          
          if (progress < duration) {
            requestAnimationFrame(animateScroll);
          } else {
            // Restore CSS scroll behavior
            chatWindow.style.scrollBehavior = 'smooth';
          }
        };
        
        requestAnimationFrame(animateScroll);
      }
    }
  };

  // FIXED: Proper unread message handling
  useEffect(() => {
    if (isOpen) {
      // When chat opens: clear unread count and mark all messages as read
      setUnreadCount(0);
      setLastReadMessageIndex(messages.length);
      setHasOpenedChat(true); // Mark that user has opened chat in this session
    } else {
      // When chat closes: check for new bot messages since last read
      const newBotMessages = messages.slice(lastReadMessageIndex).filter(msg => 
        msg.role === "assistant" || msg.role === "bot"
      );
      
      if (newBotMessages.length > 0) {
        // Count unique bot responses (each bot message = 1, regardless of action chips)
        setUnreadCount(newBotMessages.length);
      }
    }
  }, [isOpen, messages.length]);

  // FIXED: Only update unread count for new messages when chat is closed
  useEffect(() => {
    if (!isOpen && messages.length > lastReadMessageIndex) {
      const newMessages = messages.slice(lastReadMessageIndex);
      const newBotMessages = newMessages.filter(msg => 
        msg.role === "assistant" || msg.role === "bot"
      );
      
      if (newBotMessages.length > 0) {
        // Each bot message counts as 1, regardless of action chips
        setUnreadCount(newBotMessages.length);
      }
    }
  }, [messages, isOpen, lastReadMessageIndex]);

  // Auto-scroll when messages change
  useEffect(() => {
    if (messages?.length > 0) {
      setTimeout(scrollToLatestMessage, 100);
    }
  }, [messages]);

  // Auto-scroll when typing state changes
  useEffect(() => {
    if (isTyping) {
      setTimeout(scrollToLatestMessage, 100);
    }
  }, [isTyping]);

  // Auto-scroll when chat opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(scrollToLatestMessage, 200);
    }
  }, [isOpen]);

  // UPDATED: Use enhanced callout config structure with backwards compatibility
  const calloutConfig = config?.features?.callout || {};
  const calloutEnabled = typeof calloutConfig === 'object' 
    ? calloutConfig.enabled !== false 
    : config?.features?.callout !== false; // Backwards compatibility
  
  const calloutText = calloutConfig.text || 
                     config?.calloutText || 
                     "Hi! 👋 Need help? I'm here to assist you.";
  
  const calloutDelay = calloutConfig.delay || 1000;
  const calloutAutoDismiss = calloutConfig.auto_dismiss || false;
  const calloutDismissTimeout = calloutConfig.dismiss_timeout || 30000;

  // FIXED: Callout should only show if user hasn't opened chat yet in this session
  useEffect(() => {
    if (!isOpen && calloutEnabled && !calloutDismissed && !hasOpenedChat) {
      const timer = setTimeout(() => setShowCallout(true), calloutDelay);
      
      // Auto-dismiss timer if enabled
      let dismissTimer;
      if (calloutAutoDismiss && calloutDismissTimeout > 0) {
        dismissTimer = setTimeout(() => {
          setShowCallout(false);
          setCalloutDismissed(true);
        }, calloutDelay + calloutDismissTimeout);
      }
      
      return () => {
        clearTimeout(timer);
        if (dismissTimer) clearTimeout(dismissTimer);
      };
    } else {
      setShowCallout(false);
    }
  }, [isOpen, calloutEnabled, calloutDismissed, hasOpenedChat, calloutDelay, calloutAutoDismiss, calloutDismissTimeout]);

  const handleCalloutClose = () => {
    setShowCallout(false);
    setCalloutDismissed(true);
  };

  // Debug logging
  console.log('ChatWidget render - state:', { 
    isOpen,
    calloutEnabled,
    calloutDismissed,
    hasOpenedChat,
    showCallout,
    unreadCount,
    lastReadMessageIndex,
    totalMessages: messages.length,
    tenant_id: config?.tenant_id,
    chat_title,
    css_variables_applied: !!config,
    widget_behavior: config?.widget_behavior
  });

  return (
    <div>
      {/* Simple screen size check - no state tracking */}
      {(window.innerWidth >= 768 || !isOpen) && (
        <div className="chat-toggle-wrapper">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="chat-toggle-button"
          >
            <MessagesSquare size={24} />
          </button>
          
          {/* FIXED: Only show notification badge when chat is closed and there are actually unread messages */}
          {!isOpen && unreadCount > 0 && (
            <div className="chat-notification-badge">
              {unreadCount}
            </div>
          )}
          
          {/* FIXED: Callout only shows if user hasn't opened chat in this session */}
          {showCallout && (
            <div className={`chat-callout ${showCallout ? 'visible' : ''}`}>
              <div className="chat-callout-header">
              <div className="chat-callout-text" dangerouslySetInnerHTML={{ __html: calloutText }}/>
                <button onClick={handleCalloutClose} className="chat-callout-close">
                  <X size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {isOpen && (
        <div className="chat-container">
          <ChatHeader onClose={() => setIsOpen(false)} />

          <div ref={chatWindowRef} className="chat-window">
            {messages.map((msg, idx) => {
              const isLastMessage = idx === messages.length - 1;
              return (
                <div 
                  key={msg.id || idx}
                  ref={isLastMessage ? lastMessageRef : null}
                >
                  <MessageBubble 
                    role={msg.role} 
                    content={msg.content}
                    files={msg.files}
                    actions={msg.actions}
                    uploadState={msg.uploadState}
                    onCancel={msg.onCancel}
                  />
                </div>
              );
            })}
            {isTyping && <TypingIndicator />}
          </div>

          <div className="chat-footer-container">
            <div className="input-container">
              <InputBar input={input} setInput={setInput} onPlusClick={() => setShowAttachmentMenu(true)} />
            </div>
            
            <ChatFooter brandText={config?.branding?.brandText || "AI"} />
            {showAttachmentMenu && config?.features?.photo_uploads !== undefined && (
              <AttachmentMenu onClose={() => setShowAttachmentMenu(false)} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}