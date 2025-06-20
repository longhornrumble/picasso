// src/components/chat/ChatWidget.jsx - FIXED callout timer bug + FOS callout text override
import React, { useState, useEffect, useRef } from "react";
import { MessagesSquare, X } from "lucide-react";
import { useChat } from "../../hooks/useChat";
import { useConfig } from "../../hooks/useConfig";
import { useCSSVariables } from "./useCSSVariables";
import ChatHeader from "./ChatHeader";
import InputBar from "./InputBar";
import ChatFooter from "./ChatFooter";
import AttachmentMenu from "./AttachmentMenu";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";

function ChatWidget() {
  const { messages, isTyping } = useChat();
  const { config } = useConfig();
  
  // Debug: Log what config we're getting
  console.log('🔍 ChatWidget config:', config);
  console.log('🔍 ChatWidget config type:', typeof config);
  console.log('🔍 ChatWidget config keys:', config ? Object.keys(config) : 'no config');
  
  // Debug: Component mounting
  console.log('🎨 ChatWidget component rendering...');
  console.log('🎨 ChatWidget messages:', messages?.length || 0);
  console.log('🎨 ChatWidget isTyping:', isTyping);
  
  // Apply CSS variables for theming
  useCSSVariables(config);
  
  // Chat state with localStorage persistence
  const [isOpen, setIsOpen] = useState(() => {
    const widgetConfig = config?.widget_behavior || {};
    
    if (!widgetConfig.remember_state) {
      return widgetConfig.start_open || false;
    }
    
    try {
      const savedState = localStorage.getItem('picasso_chat_state');
      if (savedState !== null) {
        return JSON.parse(savedState);
      }
    } catch (error) {
      console.warn('Failed to parse saved chat state:', error);
    }
    
    return widgetConfig.start_open || false;
  });
  
  const [input, setInput] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [showCallout, setShowCallout] = useState(false);
  const [calloutDismissed, setCalloutDismissed] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  
  // Track last read message and user interaction
  const [lastReadMessageIndex, setLastReadMessageIndex] = useState(0);
  const [hasOpenedChat, setHasOpenedChat] = useState(false);
  
  // 🔧 FIX: Add ref to track if callout was auto-dismissed
  const calloutAutoDismissedRef = useRef(false);

  // Iframe communication helper
  const notifyParentEvent = (event, payload = {}) => {
    // Only notify if we're in an iframe
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'PICASSO_EVENT',
        event,
        payload
      }, '*');
    }
  };

  // Persist chat open/close on toggle
  const handleToggle = () => {
    const newOpen = !isOpen;
    setIsOpen(newOpen);
    
    // Notify parent of state change (PRD requirement)
    notifyParentEvent(newOpen ? 'CHAT_OPENED' : 'CHAT_CLOSED');
    
    if (config?.widget_behavior?.remember_state) {
      try {
        localStorage.setItem('picasso_chat_state', JSON.stringify(newOpen));
      } catch (e) {
        console.warn('Failed to save chat state on toggle:', e);
      }
    }
  };

  // Auto-open delay functionality with remember_state support
  useEffect(() => {
    const widgetConfig = config?.widget_behavior || {};
    if (!isOpen && widgetConfig.auto_open_delay > 0) {
      let skipAutoOpen = false;
      if (widgetConfig.remember_state) {
        try {
          const saved = localStorage.getItem('picasso_chat_state');
          if (saved !== null) {
            skipAutoOpen = JSON.parse(saved) === false;
          }
        } catch (e) {
          console.warn('Failed to read saved chat state for auto-open check', e);
        }
      }
      if (!skipAutoOpen) {
        const timer = setTimeout(() => {
          setIsOpen(true);
        }, widgetConfig.auto_open_delay * 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [config?.widget_behavior, isOpen, config?.tenant_id]);

  // Add/remove chat-open class
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add("chat-open");
    } else {
      document.body.classList.remove("chat-open");
    }
  }, [isOpen]);

  // Auto-close attachment menu if photo_uploads disabled
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

  // Auto-scroll function
  const scrollToLatestMessage = () => {
    if (lastMessageRef.current) {
      const chatWindow = chatWindowRef.current;
      if (chatWindow) {
        chatWindow.style.scrollBehavior = 'auto';
        
        const targetElement = lastMessageRef.current;
        const targetPosition = targetElement.offsetTop - chatWindow.offsetTop;
        const startPosition = chatWindow.scrollTop;
        const distance = targetPosition - startPosition;
        const duration = 800;
        
        let start = null;
        
        const animateScroll = (timestamp) => {
          if (!start) start = timestamp;
          const progress = timestamp - start;
          const percentage = Math.min(progress / duration, 1);
          
          const easeOut = 1 - Math.pow(1 - percentage, 3);
          
          chatWindow.scrollTop = startPosition + (distance * easeOut);
          
          if (progress < duration) {
            requestAnimationFrame(animateScroll);
          } else {
            chatWindow.style.scrollBehavior = 'smooth';
          }
        };
        
        requestAnimationFrame(animateScroll);
      }
    }
  };

  // Unread message handling
  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
      setLastReadMessageIndex(messages.length);
      setHasOpenedChat(true);
    } else {
      const newBotMessages = messages.slice(lastReadMessageIndex).filter(msg => 
        msg.role === "assistant" || msg.role === "bot"
      );
      
      if (newBotMessages.length > 0) {
        setUnreadCount(newBotMessages.length);
      }
    }
  }, [isOpen, messages.length]);

  useEffect(() => {
    if (!isOpen && messages.length > lastReadMessageIndex) {
      const newMessages = messages.slice(lastReadMessageIndex);
      const newBotMessages = newMessages.filter(msg => 
        msg.role === "assistant" || msg.role === "bot"
      );
      
      if (newBotMessages.length > 0) {
        setUnreadCount(newBotMessages.length);
      }
    }
  }, [messages, isOpen, lastReadMessageIndex]);

  // Auto-scroll effects
  useEffect(() => {
    if (messages?.length > 0) {
      setTimeout(scrollToLatestMessage, 100);
    }
  }, [messages]);

  useEffect(() => {
    if (isTyping) {
      setTimeout(scrollToLatestMessage, 100);
    }
  }, [isTyping]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(scrollToLatestMessage, 200);
    }
  }, [isOpen]);

  // 🔧 FIXED: Callout management with proper config access
  const calloutConfig = config?.features?.callout || {};
  const calloutEnabled = typeof calloutConfig === 'object' 
    ? calloutConfig.enabled !== false 
    : config?.features?.callout !== false;
  
  // 🔧 FIXED: Proper callout text override hierarchy for FOS config
  const calloutText = calloutConfig.text || 
                     config?.calloutText || 
                     config?.callout_text ||  // Legacy support
                     "Hi! 👋 Need help? I'm here to assist you.";
  
  const calloutDelay = calloutConfig.delay || 1000;
  const calloutAutoDismiss = calloutConfig.auto_dismiss || false;
  const calloutDismissTimeout = calloutConfig.dismiss_timeout || 30000;

  // 🔧 FIXED: Separate callout display logic from dismissal state
  useEffect(() => {
    if (!isOpen && calloutEnabled && !calloutDismissed && !hasOpenedChat) {
      const timer = setTimeout(() => {
        setShowCallout(true);
      }, calloutDelay);
      
      return () => clearTimeout(timer);
    } else {
      setShowCallout(false);
    }
  }, [isOpen, calloutEnabled, calloutDismissed, hasOpenedChat, calloutDelay]);

  // 🔧 FIXED: Handle auto-dismiss separately without affecting toggle functionality
  useEffect(() => {
    if (showCallout && calloutAutoDismiss && calloutDismissTimeout > 0 && !calloutAutoDismissedRef.current) {
      const dismissTimer = setTimeout(() => {
        console.log('🕐 Callout auto-dismissing after timeout');
        setShowCallout(false);
        calloutAutoDismissedRef.current = true; // Mark as auto-dismissed but don't block future shows
        
        // 🔧 FIX: Don't set calloutDismissed to true here - that permanently blocks the callout
        // Instead, just hide it for this session but allow it to show again if user refreshes
      }, calloutDismissTimeout);
      
      return () => clearTimeout(dismissTimer);
    }
  }, [showCallout, calloutAutoDismiss, calloutDismissTimeout]);

  // 🔧 FIXED: Manual callout close handler
  const handleCalloutClose = () => {
    console.log('❌ Callout manually closed by user');
    setShowCallout(false);
    setCalloutDismissed(true); // Only set permanent dismiss on manual close
  };

  // 🔧 FIXED: Reset auto-dismiss state when user opens chat
  useEffect(() => {
    if (isOpen && hasOpenedChat) {
      calloutAutoDismissedRef.current = false; // Reset auto-dismiss state
      setCalloutDismissed(true); // Permanently dismiss since user engaged
    }
  }, [isOpen, hasOpenedChat]);

  // Debug logging including callout text detection
  console.log('ChatWidget render - state:', { 
    isOpen,
    calloutEnabled,
    calloutDismissed,
    hasOpenedChat,
    showCallout,
    calloutText, // 🔧 Added for debugging FOS override
    calloutAutoDismissed: calloutAutoDismissedRef.current,
    unreadCount,
    lastReadMessageIndex,
    totalMessages: messages.length,
    tenant_id: config?.tenant_id,
    chat_title,
    css_variables_applied: !!config,
    widget_behavior: config?.widget_behavior,
    // 🔧 Added callout config debugging
    calloutConfig: {
      fullConfig: calloutConfig,
      textFromConfig: calloutConfig.text,
      textFromRoot: config?.calloutText,
      textFromLegacy: config?.callout_text
    },
    // Debug iframe and responsive behavior
    windowWidth: window.innerWidth,
    isIframe: document.body.getAttribute('data-iframe'),
    shouldShowToggle: (window.innerWidth >= 768 || !isOpen),
    shouldShowChat: isOpen
  });

  const isDoubleInput = config?.features?.uploads || config?.features?.voice;

  // Don't render anything if config is still loading to prevent null reference errors
  if (!config) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100%', 
        color: '#666',
        fontFamily: 'system-ui'
      }}>
        Loading...
      </div>
    );
  }

  return (
    <div>
      {/* Widget toggle and callout - Show in iframe mode when closed */}
      {(window.innerWidth >= 768 || !isOpen) && (
        <div className="chat-toggle-wrapper">
          <button
            onClick={() => {
              console.log(`🔄 Widget toggle clicked: ${isOpen ? 'closing' : 'opening'}`);
              handleToggle();
            }}
            className="chat-toggle-button"
          >
            <MessagesSquare size={24} />
          </button>
          
          {/* Notification badge */}
          {!isOpen && unreadCount > 0 && (
            <div className="chat-notification-badge">
              {unreadCount}
            </div>
          )}
          
          {/* 🔧 FIXED: Callout with proper state management and text override */}
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

      {/* Chat container - Show when open */}
      {isOpen && (
        <div className="chat-container" data-input-mode={isDoubleInput ? "double" : "single"}>
          <ChatHeader onClose={() => {
            setIsOpen(false);
            if (config?.widget_behavior?.remember_state) {
              localStorage.setItem('picasso_chat_state', 'false');
            }
          }} />

          <div ref={chatWindowRef} className="chat-window">
            <div className="chat-header-spacer" />
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

export default ChatWidget;