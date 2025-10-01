// src/components/chat/ChatWidget.jsx - PERFORMANCE OPTIMIZED: Fixed render loop and version conflicts
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { MessagesSquare, X } from "lucide-react";
import { useChat } from "../../hooks/useChat";
import { useConfig } from "../../hooks/useConfig";
import { useCSSVariables } from "./useCSSVariables";
import { initializeMobileCompatibility } from "../../utils/mobileCompatibility";
import ChatHeader from "./ChatHeader";
import InputBar from "./InputBar";
import ChatFooter from "./ChatFooter";
import "./ChatWidget.css";
import AttachmentMenu from "./AttachmentMenu";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";
import StateManagementPanel from "./StateManagementPanel";
import FormFieldPrompt from "../forms/FormFieldPrompt";
import FormCompletionCard from "../forms/FormCompletionCard";
import { useFormMode } from "../../context/FormModeContext";

function ChatWidget() {
  const { messages, isTyping, renderMode, recordFormCompletion } = useChat();
  const { config } = useConfig();
  const { isFormMode, isSuspended, cancelForm, isFormComplete, completedFormData, completedFormConfig, currentFormId, clearCompletionState } = useFormMode();

  // In iframe mode, we don't need breakpoints - the iframe container handles responsive sizing
  // The widget should always fill its container
  
  // Apply CSS variables for theming
  useCSSVariables(config);
  
  // PHASE 1B: Record form completion automatically when form completes
  useEffect(() => {
    if (isFormComplete && completedFormData && currentFormId && recordFormCompletion) {
      console.log('[ChatWidget] Form completed - recording completion:', currentFormId);
      recordFormCompletion(currentFormId, completedFormData);
    }
  }, [isFormComplete, completedFormData, currentFormId, recordFormCompletion]);

  // Listen for host commands via custom events (iframe communication bridge)
  useEffect(() => {
    const handleOpenChat = () => {
      console.log('📡 ChatWidget received picasso-open-chat event');
      setIsOpen(true);
    };

    const handleCloseChat = () => {
      console.log('📡 ChatWidget received picasso-close-chat event');
      setIsOpen(false);
    };

    window.addEventListener('picasso-open-chat', handleOpenChat);
    window.addEventListener('picasso-close-chat', handleCloseChat);

    return () => {
      window.removeEventListener('picasso-open-chat', handleOpenChat);
      window.removeEventListener('picasso-close-chat', handleCloseChat);
    };
  }, []);
  
  // Chat state with sessionStorage persistence (matches conversation persistence)
  const [isOpen, setIsOpen] = useState(() => {
    const widgetConfig = config?.widget_behavior || {};
    
    if (!widgetConfig.remember_state) {
      return widgetConfig.start_open || false;
    }
    
    try {
      // Use sessionStorage to match conversation persistence behavior
      const savedState = sessionStorage.getItem('picasso_chat_state');
      const lastActivity = sessionStorage.getItem('picasso_last_activity');
      
      if (savedState !== null && lastActivity) {
        const timeSinceActivity = Date.now() - parseInt(lastActivity);
        const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
        
        if (timeSinceActivity < SESSION_TIMEOUT) {
          return JSON.parse(savedState);
        }
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
  const [showStateManagement, setShowStateManagement] = useState(false);
  
  // Track last read message and user interaction
  const [lastReadMessageIndex, setLastReadMessageIndex] = useState(() => {
    // Initialize from sessionStorage if available
    if (config?.widget_behavior?.remember_state) {
      try {
        const savedState = sessionStorage.getItem('picasso_chat_state');
        const lastActivity = sessionStorage.getItem('picasso_last_activity');
        const savedReadIndex = sessionStorage.getItem('picasso_last_read_index');
        
        if (savedState !== null && lastActivity && savedReadIndex !== null) {
          const timeSinceActivity = Date.now() - parseInt(lastActivity);
          const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
          
          if (timeSinceActivity < SESSION_TIMEOUT) {
            return parseInt(savedReadIndex) || 0;
          }
        }
      } catch (error) {
        console.warn('Failed to parse saved read index:', error);
      }
    }
    return 0;
  });
  const [hasOpenedChat, setHasOpenedChat] = useState(false);
  
  // 🔧 FIX: Add ref to track if callout was auto-dismissed
  const calloutAutoDismissedRef = useRef(false);

  // Iframe communication helper - memoized to prevent recreating on every render
  const notifyParentEvent = useCallback((event, payload = {}) => {
    // Only notify if we're in an iframe
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'PICASSO_EVENT',
        event,
        payload
      }, '*');
    }
  }, []);

  // Persist chat open/close on toggle - memoized to prevent recreating on every render
  const handleToggle = useCallback(() => {
    const newOpen = !isOpen;
    
    // Update state immediately
    setIsOpen(newOpen);
    
    // Manually update body class immediately for iframe communication
    // This ensures the widget-frame.html SIZE_CHANGE message is sent at the right time
    if (newOpen) {
      document.body.classList.add("chat-open");
    } else {
      document.body.classList.remove("chat-open");
    }
    
    // Notify parent of state change (PRD requirement)
    notifyParentEvent(newOpen ? 'CHAT_OPENED' : 'CHAT_CLOSED');
    
    // Notify parent of size change for iframe container adjustment
    notifyParentEvent('SIZE_CHANGE', {
      isOpen: newOpen,
      size: newOpen ? { width: 360, height: 640 } : { width: 90, height: 90 }
    });

    // Also send the PICASSO_SIZE_CHANGE message that widget-host.js expects
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'PICASSO_SIZE_CHANGE',
        isOpen: newOpen
      }, '*');
    }
    
    if (config?.widget_behavior?.remember_state) {
      try {
        sessionStorage.setItem('picasso_chat_state', JSON.stringify(newOpen));
        sessionStorage.setItem('picasso_last_activity', Date.now().toString());
        // Save the last read index when closing
        if (!newOpen) {
          sessionStorage.setItem('picasso_last_read_index', lastReadMessageIndex.toString());
        }
      } catch (e) {
        console.warn('Failed to save chat state on toggle:', e);
      }
    }
  }, [isOpen, lastReadMessageIndex, config?.widget_behavior?.remember_state, notifyParentEvent]);

  // Auto-open delay functionality with remember_state support - optimized dependencies
  useEffect(() => {
    const widgetConfig = config?.widget_behavior || {};
    if (!isOpen && widgetConfig.auto_open_delay > 0) {
      let skipAutoOpen = false;
      if (widgetConfig.remember_state) {
        try {
          const saved = sessionStorage.getItem('picasso_chat_state');
          const lastActivity = sessionStorage.getItem('picasso_last_activity');
          
          if (saved !== null && lastActivity) {
            const timeSinceActivity = Date.now() - parseInt(lastActivity);
            const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
            
            if (timeSinceActivity < SESSION_TIMEOUT) {
              skipAutoOpen = JSON.parse(saved) === false;
            }
          }
        } catch (e) {
          console.warn('Failed to read saved chat state for auto-open check', e);
        }
      }
      if (!skipAutoOpen) {
        const timer = setTimeout(() => {
          setIsOpen(true);
          // Update activity timestamp when auto-opening
          if (widgetConfig.remember_state) {
            try {
              sessionStorage.setItem('picasso_chat_state', 'true');
              sessionStorage.setItem('picasso_last_activity', Date.now().toString());
            } catch (e) {
              console.warn('Failed to save chat state on auto-open:', e);
            }
          }
        }, widgetConfig.auto_open_delay * 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [config?.widget_behavior?.auto_open_delay, config?.widget_behavior?.remember_state, isOpen]);

  // Add/remove chat-open class immediately for iframe communication
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add("chat-open");
    } else {
      document.body.classList.remove("chat-open");
    }
  }, [isOpen]);

  // Add/remove callout-visible class for CSS targeting
  useEffect(() => {
    if (showCallout) {
      document.body.classList.add("callout-visible");
      document.body.setAttribute("data-callout-visible", "true");
    } else {
      document.body.classList.remove("callout-visible");
      document.body.removeAttribute("data-callout-visible");
    }
  }, [showCallout]);

  // Auto-close attachment menu if photo_uploads disabled
  useEffect(() => {
    if (!config?.features?.photo_uploads && showAttachmentMenu) {
      setShowAttachmentMenu(false);
    }
  }, [config?.features?.photo_uploads, showAttachmentMenu]);
  
  // Auto-scroll refs
  const chatWindowRef = useRef(null);
  const lastMessageRef = useRef(null);
  const hasRestoredScrollRef = useRef(false);

  // Get chat title
  const chat_title = config?.chat_title || 
                    config?.branding?.chat_title || 
                    "Chat";

  // Auto-scroll function - memoized to prevent recreating on every render
  const scrollToLatestMessage = useCallback(() => {
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
  }, []);

  // Save scroll position when chat is closed
  useEffect(() => {
    if (!isOpen && chatWindowRef.current) {
      const scrollPosition = chatWindowRef.current.scrollTop;
      sessionStorage.setItem('picasso_scroll_position', scrollPosition.toString());
    }
  }, [isOpen]);

  // Restore scroll position when chat opens with persisted conversation
  useEffect(() => {
    if (isOpen && chatWindowRef.current && !hasRestoredScrollRef.current && messages.length > 1) {
      const savedPosition = sessionStorage.getItem('picasso_scroll_position');
      const hasPersistedMessages = sessionStorage.getItem('picasso_messages');
      
      if (savedPosition) {
        // Delay to ensure DOM is ready
        setTimeout(() => {
          if (chatWindowRef.current) {
            chatWindowRef.current.scrollTop = parseInt(savedPosition);
            hasRestoredScrollRef.current = true;
          }
        }, 100);
      }
      
      // Silently continue conversation without indicator
    }
  }, [isOpen, messages.length]);

  // Unread message handling - Only count bot/assistant messages received while closed
  useEffect(() => {
    if (isOpen) {
      // When chat opens, reset unread count and update last read index
      setUnreadCount(0);
      setLastReadMessageIndex(messages.length);
      setHasOpenedChat(true);
      
      // Update saved read index when opening chat
      if (config?.widget_behavior?.remember_state) {
        try {
          sessionStorage.setItem('picasso_last_read_index', messages.length.toString());
        } catch (e) {
          console.warn('Failed to save last read index:', e);
        }
      }
    }
  }, [isOpen, messages.length, config?.widget_behavior?.remember_state]);

  // Update unread count only when new bot messages arrive while chat is closed
  useEffect(() => {
    if (!isOpen && messages.length > lastReadMessageIndex) {
      // Only count bot/assistant messages that came after the last read index
      const newBotMessages = messages.slice(lastReadMessageIndex).filter(msg => 
        msg.role === "assistant" || msg.role === "bot"
      );
      
      // Update unread count to reflect only bot messages
      setUnreadCount(newBotMessages.length);
    }
  }, [messages, isOpen, lastReadMessageIndex]);

  // Auto-scroll effects - optimized with proper dependencies
  useEffect(() => {
    if (messages?.length > 0) {
      setTimeout(scrollToLatestMessage, 100);
    }
  }, [messages?.length, scrollToLatestMessage]);

  useEffect(() => {
    if (isTyping) {
      setTimeout(scrollToLatestMessage, 100);
    }
  }, [isTyping, scrollToLatestMessage]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(scrollToLatestMessage, 200);
    }
  }, [isOpen, scrollToLatestMessage]);

  // Auto-scroll when form state changes
  useEffect(() => {
    if (isFormMode || isSuspended || isFormComplete) {
      setTimeout(scrollToLatestMessage, 100);
    }
  }, [isFormMode, isSuspended, isFormComplete, scrollToLatestMessage]);

  // 🔧 FIXED: Manual callout close handler - memoized to prevent recreating
  const handleCalloutClose = useCallback(() => {
    setShowCallout(false);
    setCalloutDismissed(true); // Only set permanent dismiss on manual close
  }, []);


  // 🔧 FIXED: Reset auto-dismiss state when user opens chat
  useEffect(() => {
    if (isOpen && hasOpenedChat) {
      calloutAutoDismissedRef.current = false; // Reset auto-dismiss state
      setCalloutDismissed(true); // Permanently dismiss since user engaged
    }
  }, [isOpen, hasOpenedChat]);

  // Initial size notification when widget loads
  useEffect(() => {
    // Send initial size when component mounts
    if (window.parent && window.parent !== window) {
      notifyParentEvent('SIZE_CHANGE', {
        isOpen: isOpen,
        size: isOpen ? { width: 360, height: 640 } : { width: 90, height: 90 },
        initial: true
      });
    }
  }, []); // Run once on mount

  // 🔧 FIXED: Callout configuration - simple values without conditional logic
  const calloutConfig = config?.features?.callout || {};
  const calloutEnabled = typeof calloutConfig === 'object' 
    ? calloutConfig.enabled !== false 
    : config?.features?.callout !== false;
  
  const calloutText = calloutConfig.text || 
                     config?.calloutText || 
                     config?.callout_text ||
                     "Hi! 👋 Need help? I'm here to assist you.";
  
  const calloutDelay = calloutConfig.delay || 1000;
  const calloutAutoDismiss = calloutConfig.auto_dismiss || false;
  const calloutDismissTimeout = calloutConfig.dismiss_timeout || 30000;

  const isDoubleInput = config?.features?.uploads || config?.features?.voice;

  // 🔧 FIXED: All callout useEffects BEFORE early return to respect hooks rules
  useEffect(() => {
    if (config && !isOpen && calloutEnabled && !calloutDismissed && !hasOpenedChat) {
      const timer = setTimeout(() => {
        setShowCallout(true);
      }, calloutDelay);
      
      return () => clearTimeout(timer);
    } else {
      setShowCallout(false);
    }
  }, [config, isOpen, calloutEnabled, calloutDismissed, hasOpenedChat, calloutDelay]);

  useEffect(() => {
    if (config && showCallout && calloutAutoDismiss && calloutDismissTimeout > 0 && !calloutAutoDismissedRef.current) {
      const dismissTimer = setTimeout(() => {
        setShowCallout(false);
        calloutAutoDismissedRef.current = true;
      }, calloutDismissTimeout);
      
      return () => clearTimeout(dismissTimer);
    }
  }, [config, showCallout, calloutAutoDismiss, calloutDismissTimeout]);

  useEffect(() => {
    if (config && window.parent && window.parent !== window) {
      const calloutData = {
        visible: showCallout,
        width: showCallout ? 300 : 0,
        height: showCallout ? 60 : 0,
        text: calloutText,
        enabled: calloutEnabled
      };
      
      notifyParentEvent('CALLOUT_STATE_CHANGE', {
        calloutConfig: calloutData
      });

      // Also send simplified callout change message for iframe resizing
      window.parent.postMessage({
        type: 'PICASSO_CALLOUT_CHANGE',
        isVisible: showCallout,
        width: showCallout ? 360 : 90
      }, '*');
    }
  }, [config, showCallout, calloutText, calloutEnabled, notifyParentEvent]);

  // Don't render anything if config is still loading to prevent null reference errors
  if (!config) {
    return (
      <div className="chat-widget-loading">
        Loading...
      </div>
    );
  }

  return (
    <div className="chat-widget-root">
      {/* Widget toggle - Always visible for better UX */}
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
            <div
              className={`chat-callout clickable ${showCallout ? 'visible' : ''}`}
              onClick={(e) => {
                // If clicking the close button, don't open the widget
                if (e.target.closest('.chat-callout-close')) {
                  return;
                }
                // Open the widget when clicking anywhere else on the callout
                if (!isOpen) {
                  handleToggle();
                }
              }}
            >
              <div className="chat-callout-header">
                <div className="chat-callout-text" dangerouslySetInnerHTML={{ __html: calloutText }}/>
                <button onClick={handleCalloutClose} className="chat-callout-close">
                  <X size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

      {/* Chat container - Show when open */}
      {isOpen && (
        <div className="chat-container" data-input-mode={isDoubleInput ? "double" : "single"}>
          <ChatHeader 
            onClose={() => {
              console.log('🔄 Header close clicked - calling handleToggle');
              handleToggle(); // Use handleToggle to properly notify parent and handle state
            }}
            onOpenSettings={() => setShowStateManagement(true)}
          />

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
                    id={msg.id}
                    role={msg.role}
                    content={msg.content}
                    files={msg.files}
                    actions={msg.actions}
                    cards={msg.cards}
                    ctaButtons={msg.ctaButtons}
                    uploadState={msg.uploadState}
                    onCancel={msg.onCancel}
                    isStreaming={msg.isStreaming}
                    metadata={msg.metadata}
                    renderMode={renderMode}
                  />
                </div>
              );
            })}
            {/* Render form field prompt when in form mode OR suspended */}
            {(isFormMode || isSuspended) && (
              <div ref={lastMessageRef}>
                <FormFieldPrompt onCancel={cancelForm} />
              </div>
            )}
            {/* Render form completion card when form is complete */}
            {isFormComplete && completedFormData && (
              <div ref={lastMessageRef}>
                <FormCompletionCard
                  formId={currentFormId}
                  formData={completedFormData}
                  formFields={completedFormConfig?.fields}
                  config={completedFormConfig?.post_submission}
                  onEndSession={() => {
                    // Record the form completion before closing
                    if (recordFormCompletion) {
                      recordFormCompletion(currentFormId, completedFormData);
                    }
                    clearCompletionState();
                    // Close the widget
                    setIsOpen(false);
                  }}
                  onContinue={() => {
                    // Record the form completion
                    if (recordFormCompletion) {
                      recordFormCompletion(currentFormId, completedFormData);
                    }
                    clearCompletionState();
                    // Widget stays open for continued conversation
                  }}
                />
              </div>
            )}
            {isTyping && !isFormMode && <TypingIndicator />}
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

      {/* Phase 3.4: State Management Panel */}
      <StateManagementPanel 
        isOpen={showStateManagement} 
        onClose={() => setShowStateManagement(false)} 
      />
    </div>
  );
}

export default ChatWidget;