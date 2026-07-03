// src/components/chat/ChatWidget.jsx - PERFORMANCE OPTIMIZED: Fixed render loop and version conflicts
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { MessagesSquare, X } from "lucide-react";
import { useChat } from "../../hooks/useChat";
import { useConfig } from "../../hooks/useConfig";
import { initializeMobileCompatibility } from "../../utils/mobileCompatibility";
import { resolveWidgetBehavior } from "../../utils/resolveWidgetBehavior";
import ChatHeader from "./ChatHeader";
import InputBar from "./InputBar";
import ChatFooter from "./ChatFooter";
import "./ChatWidget.css";
import AttachmentMenu from "./AttachmentMenu";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";
import SettingsView from "./SettingsView";
import PrivacyView from "./PrivacyView";
import WelcomeView from "./WelcomeView";
import QuestionsOverlay from "./QuestionsOverlay";
import FormFieldPrompt from "../forms/FormFieldPrompt";
import FormCompletionCard from "../forms/FormCompletionCard";
import { useFormMode } from "../../context/FormModeContext";
import { sanitizeHTML } from "../../utils/security";
import { _storeGet, _storeSet, _storeRemove } from "../../context/shared/messageHelpers";

function ChatWidget() {
  const { messages, isTyping, renderMode, recordFormCompletion } = useChat();
  const { config } = useConfig();
  const { isFormMode, isSuspended, cancelForm, isFormComplete, completedFormData, completedFormConfig, currentFormId, clearCompletionState } = useFormMode();

  // Resolve widget behavior: merges mobile overrides onto global defaults when on mobile
  const widgetBehavior = useMemo(() => resolveWidgetBehavior(config), [config]);

  // Hairline redesign (W3.1): welcome vs. thread content view.
  //
  // DESIGN_SPEC.md's state model lists `activeView` as
  // welcome | thread | questionsOverlay | settings | privacy | historyList.
  // Settings/privacy/historyList are W3.3/W3.4's own takeover views, already
  // wired independently below via `showStateManagement` (a boolean overlay
  // rendered on top of everything, per W3.3 — see its render note further
  // down). This item extends the model with the remaining two states,
  // welcome/thread, WITHOUT folding settings into the same enum: doing so
  // would require restructuring how SettingsView mounts (it deliberately
  // keeps header/content/footer mounted underneath itself so "back
  // preserves scroll" is free — HAIRLINE_WORKPLAN.md guardrail says not to
  // rewrite that wiring). So there are two independent, composable pieces
  // of view-state here: `activeView` (welcome|thread, content area only)
  // and `showStateManagement` (settings takeover, layered on top of either).
  //
  // `activeView` is DERIVED from `messages`, not separate state: every chat
  // provider seeds a sentinel `{id: 'welcome', ...}` message (or no message
  // at all, if the tenant has no `welcome_message` configured) before any
  // real interaction, and `clearMessages()` (frozen, unchanged by this
  // item) resets back to that same shape. So "has anything besides the
  // sentinel happened yet" is exactly "welcome vs. thread" — first open,
  // returning mid-conversation, first send, and "Clear all messages" (which
  // calls the SAME clearMessages()) all fall out of this one computation for
  // free, with no new state to keep in sync.
  const hasStartedThread = useMemo(
    () => messages.some((msg) => msg.id !== "welcome"),
    [messages]
  );
  const activeView = hasStartedThread ? "thread" : "welcome";

  // W3.2: opens the Common questions overlay (QuestionsOverlay.jsx),
  // summoned from WelcomeView's "Common questions" row. `showQuestionsOverlay`
  // is deliberately its own boolean (not folded into `activeView`) — same
  // reasoning as `showStateManagement` above: it's a takeover layered on top
  // of whichever content view is showing, not a replacement for it.
  const [showQuestionsOverlay, setShowQuestionsOverlay] = useState(false);
  const handleOpenQuestions = useCallback(() => {
    setShowQuestionsOverlay(true);
  }, []);

  // In iframe mode, we don't need breakpoints - the iframe container handles responsive sizing
  // The widget should always fill its container

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
    const widgetConfig = widgetBehavior;
    
    if (!widgetConfig.remember_state) {
      return widgetConfig.start_open || false;
    }
    
    try {
      // Use sessionStorage to match conversation persistence behavior
      const savedState = _storeGet('picasso_chat_state');
      const lastActivity = _storeGet('picasso_last_activity');
      
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
  // W3.4: whether Settings' "Privacy & compliance" row has drilled into
  // PrivacyView. Scoped inside `showStateManagement` (only meaningful while
  // Settings is open) — see the render block below for how the two combine.
  const [showPrivacy, setShowPrivacy] = useState(false);
  
  // Track last read message and user interaction
  const [lastReadMessageIndex, setLastReadMessageIndex] = useState(() => {
    // Initialize from sessionStorage if available
    if (widgetBehavior.remember_state) {
      try {
        const savedState = _storeGet('picasso_chat_state');
        const lastActivity = _storeGet('picasso_last_activity');
        const savedReadIndex = _storeGet('picasso_last_read_index');
        
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

  // Measure the actual dimensions needed for the closed state (toggle + badge + callout)
  const measureClosedDimensions = useCallback(() => {
    // When closed, we need to account for:
    // 1. Toggle button (56px x 56px)
    // 2. Notification badge (extends 8px beyond button on top-right)
    // 3. Callout bubble (positioned 70px to the left, ~300px wide max)

    const toggleSize = 56; // Base toggle button size
    const badgeOverflow = 8; // Badge extends 8px beyond button
    const calloutSpacing = 70; // Callout is 70px to the left of toggle
    const calloutMaxWidth = 300; // Typical callout width
    const calloutHeight = 60; // Approximate callout height

    // Calculate required dimensions
    let width = toggleSize + (badgeOverflow * 2); // Account for badge on both sides for safety
    let height = toggleSize + (badgeOverflow * 2); // Account for badge overflow

    // If callout is visible, add its width + spacing
    if (showCallout) {
      width = calloutMaxWidth + calloutSpacing + toggleSize + (badgeOverflow * 2);
      height = Math.max(height, calloutHeight); // Use whichever is taller
    }

    // Add some padding for safety
    width += 20;
    height += 20;

    console.log('📏 measureClosedDimensions called:', { showCallout, width, height });
    return { width, height };
  }, [showCallout]);

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

    // Calculate dimensions based on state
    const dimensions = newOpen
      ? { width: 360, height: 640 }
      : measureClosedDimensions();

    // Notify parent of size change for iframe container adjustment
    notifyParentEvent('SIZE_CHANGE', {
      isOpen: newOpen,
      size: dimensions
    });

    // Also send the PICASSO_SIZE_CHANGE message that widget-host.js expects
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'PICASSO_SIZE_CHANGE',
        isOpen: newOpen,
        dimensions: dimensions
      }, '*');
    }

    if (widgetBehavior.remember_state) {
      try {
        _storeSet('picasso_chat_state', JSON.stringify(newOpen));
        _storeSet('picasso_last_activity', Date.now().toString());
        // Save the last read index when closing
        if (!newOpen) {
          _storeSet('picasso_last_read_index', lastReadMessageIndex.toString());
        }
      } catch (e) {
        console.warn('Failed to save chat state on toggle:', e);
      }
    }
  }, [isOpen, lastReadMessageIndex, widgetBehavior.remember_state, notifyParentEvent, measureClosedDimensions]);

  // Apply start_open when config loads asynchronously
  useEffect(() => {
    if (!isOpen && widgetBehavior.start_open) {
      // Respect remember_state: don't override if user explicitly closed
      if (widgetBehavior.remember_state) {
        try {
          const saved = _storeGet('picasso_chat_state');
          const lastActivity = _storeGet('picasso_last_activity');
          if (saved !== null && lastActivity) {
            const timeSinceActivity = Date.now() - parseInt(lastActivity);
            if (timeSinceActivity < 30 * 60 * 1000 && JSON.parse(saved) === false) {
              return; // User closed it within session, respect that
            }
          }
        } catch (e) { /* ignore */ }
      }
      setIsOpen(true);
    }
  }, [widgetBehavior.start_open, widgetBehavior.remember_state]);

  // Auto-open delay functionality with remember_state support - optimized dependencies
  useEffect(() => {
    const widgetConfig = widgetBehavior;
    if (!isOpen && widgetConfig.auto_open_delay > 0) {
      let skipAutoOpen = false;
      if (widgetConfig.remember_state) {
        try {
          const saved = _storeGet('picasso_chat_state');
          const lastActivity = _storeGet('picasso_last_activity');
          
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
              _storeSet('picasso_chat_state', 'true');
              _storeSet('picasso_last_activity', Date.now().toString());
            } catch (e) {
              console.warn('Failed to save chat state on auto-open:', e);
            }
          }
        }, widgetConfig.auto_open_delay * 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [widgetBehavior.auto_open_delay, widgetBehavior.remember_state, isOpen]);

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
      _storeSet('picasso_scroll_position', scrollPosition.toString());
    }
  }, [isOpen]);

  // Restore scroll position when chat opens with persisted conversation
  useEffect(() => {
    if (isOpen && chatWindowRef.current && !hasRestoredScrollRef.current && messages.length > 1) {
      const savedPosition = _storeGet('picasso_scroll_position');
      const hasPersistedMessages = _storeGet('picasso_messages');
      
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
      if (widgetBehavior.remember_state) {
        try {
          _storeSet('picasso_last_read_index', messages.length.toString());
        } catch (e) {
          console.warn('Failed to save last read index:', e);
        }
      }
    }
  }, [isOpen, messages.length, widgetBehavior.remember_state]);

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

  // Initial size notification when widget loads - runs after callout state is set
  useEffect(() => {
    // Only send initial size after config is loaded (to ensure callout state is determined)
    if (window.parent && window.parent !== window && config) {
      const initialDimensions = isOpen
        ? { width: 360, height: 640 }
        : measureClosedDimensions();

      // Send SIZE_CHANGE event (PRD-compliant)
      notifyParentEvent('SIZE_CHANGE', {
        isOpen: isOpen,
        size: initialDimensions,
        initial: true
      });

      // Also send PICASSO_SIZE_CHANGE for widget-host.js compatibility
      window.parent.postMessage({
        type: 'PICASSO_SIZE_CHANGE',
        isOpen: isOpen,
        dimensions: initialDimensions
      }, '*');

      console.log('📐 Sent initial dimensions:', initialDimensions, 'isOpen:', isOpen, 'showCallout:', showCallout);
    }
  }, [config, isOpen, measureClosedDimensions, showCallout, notifyParentEvent]); // Run when these are available

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

      // When callout visibility changes and chat is closed, recalculate and send new dimensions
      if (!isOpen) {
        const closedDimensions = measureClosedDimensions();
        window.parent.postMessage({
          type: 'PICASSO_SIZE_CHANGE',
          isOpen: false,
          dimensions: closedDimensions
        }, '*');
        console.log(`📐 Callout visibility changed, updated closed dimensions:`, closedDimensions);
      }
    }
  }, [config, showCallout, calloutText, calloutEnabled, notifyParentEvent, isOpen, measureClosedDimensions]);

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
            {isOpen ? <X size={24} /> : <MessagesSquare size={24} />}
          </button>
          
          {/* Notification badge — Hairline redesign (W4.5): re-skinned via a
              new `.hairline-badge` className (styles in ChatWidget.css) so
              old theme.css's `.chat-notification-badge` rules (still
              coexisting, several `!important`) simply no longer match —
              same class-swap strategy hairline-shell.css used for the
              shell/header. State/logic above is unchanged. */}
          {!isOpen && unreadCount > 0 && (
            <div className="hairline-badge">
              {unreadCount}
            </div>
          )}

          {/* Callout teaser — Hairline redesign (W4.5): re-skinned via new
              `.hairline-callout`/`.hairline-callout-text` classNames (styles
              in ChatWidget.css), same class-swap rationale as the badge
              above. The launcher button itself (`.chat-toggle-button`
              above) is explicitly OUT OF SCOPE this phase
              (HAIRLINE_WORKPLAN.md W4.5) — untouched. All
              state/handlers/dismiss semantics below are UNCHANGED (frozen —
              HAIRLINE_WORKPLAN.md ground rule #2); only the markup/classNames
              changed (the old `.chat-callout-header` wrapper div, which only
              ever held these same two children, is folded away since
              `.hairline-callout` is the flex row directly). */}
          {showCallout && (
            <div
              className="hairline-callout"
              onClick={(e) => {
                // If clicking the close button, don't open the widget
                if (e.target.closest('.hairline-callout-dismiss')) {
                  return;
                }
                // Open the widget when clicking anywhere else on the callout
                if (!isOpen) {
                  handleToggle();
                }
              }}
            >
              <div className="hairline-callout-text" dangerouslySetInnerHTML={{ __html: sanitizeHTML(calloutText) }}/>
              <button
                type="button"
                onClick={handleCalloutClose}
                className="hairline-icon-button hairline-callout-dismiss"
                aria-label="Dismiss"
              >
                <X size={13} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>

      {/* Chat container - Show when open. Hairline redesign (W2.1): className
          moved from "chat-container" to "hairline-shell" (styles in
          src/styles/hairline-shell.css) — see that file's header comment for
          why this is a clean class swap rather than a layered override. */}
      {isOpen && (
        <div className="hairline-shell" data-input-mode={isDoubleInput ? "double" : "single"}>
          <ChatHeader 
            onClose={() => {
              console.log('🔄 Header close clicked - calling handleToggle');
              handleToggle(); // Use handleToggle to properly notify parent and handle state
            }}
            onOpenSettings={() => setShowStateManagement(true)}
          />

          {activeView === "welcome" ? (
            <WelcomeView onOpenQuestions={handleOpenQuestions} />
          ) : (
            <div ref={chatWindowRef} className="chat-window">
              <div className="chat-header-spacer" />
              {/* The sentinel welcome message (id: 'welcome') stays in the
                  provider's `messages` array for step-numbering/analytics
                  purposes (frozen — see providers), but its content is now
                  shown only via WelcomeView above, before the thread starts.
                  Hairline's In-flight mock (bundle 03-in-flight.png) opens
                  directly on the user's first message, not a repeated
                  greeting bubble, so it's filtered out of the rendered
                  thread here (presentation-only; the underlying array is
                  untouched). */}
              {messages
                .filter((msg) => msg.id !== "welcome")
                .map((msg, idx, visibleMessages) => {
                  const isLastMessage = idx === visibleMessages.length - 1;
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
                        showcaseCard={msg.showcaseCard}
                        suggestedChips={msg.suggestedChips}
                        uploadState={msg.uploadState}
                        onCancel={msg.onCancel}
                        isStreaming={msg.isStreaming}
                        metadata={msg.metadata}
                        renderMode={renderMode}
                      />
                    </div>
                  );
                })}
              {/* Render form field prompt when in form mode OR suspended BUT NOT when complete */}
              {(isFormMode || isSuspended) && !isFormComplete && (
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
                      // Form completion already recorded via useEffect above
                      // Don't call recordFormCompletion here to avoid duplicate submissions
                      clearCompletionState();
                      // Close the widget
                      setIsOpen(false);
                    }}
                    onContinue={() => {
                      // Form completion already recorded via useEffect above
                      // Don't call recordFormCompletion here to avoid duplicate submissions
                      clearCompletionState();
                      // Widget stays open for continued conversation
                    }}
                  />
                </div>
              )}
              {isTyping && !isFormMode && <TypingIndicator />}
            </div>
          )}

          <div className="chat-footer-container">
            <div className="input-container">
              <InputBar input={input} setInput={setInput} onPlusClick={() => setShowAttachmentMenu(true)} />
            </div>
            
            <ChatFooter brandText={config?.branding?.brandText || "AI"} />
            {showAttachmentMenu && config?.features?.photo_uploads !== undefined && (
              <AttachmentMenu onClose={() => setShowAttachmentMenu(false)} />
            )}
          </div>

          {/* Hairline redesign (W3.3/W3.4): Settings full-widget takeover,
              plus its own nested Privacy & compliance page (W3.4). Rendered
              only while open (not always-mounted), so it plays its own
              entrance animation each time; the header/chat-window/footer
              above stay mounted underneath the whole time — that's what
              makes "back preserves scroll" free, since nothing above ever
              unmounts while Settings/Privacy is showing. Replaces
              StateManagementPanel's old modal render as the settings icon's
              destination (StateManagementPanel.jsx itself is left on disk,
              unreferenced, for W6.2 to delete).

              Settings and Privacy are mutually exclusive AT RENDER TIME
              (`showPrivacy` nested inside the `showStateManagement` gate):
              opening Privacy from Settings' "Privacy & compliance" row
              unmounts SettingsView and mounts PrivacyView in its place, at
              the same z-index tier — not stacked on top of it. That keeps
              each view's own ESC listener independent (only one is ever
              mounted at a time), so a single ESC press pops exactly one
              level (Privacy -> Settings -> thread), matching
              DESIGN_SPEC.md's "back returns to settings" for this page. */}
          {showStateManagement &&
            (showPrivacy ? (
              <PrivacyView
                onBack={() => setShowPrivacy(false)}
                onClose={() => {
                  // Same "close the whole widget" contract as Settings' own
                  // ✕ below.
                  setShowPrivacy(false);
                  setShowStateManagement(false);
                  handleToggle();
                }}
              />
            ) : (
              <SettingsView
                onBack={() => setShowStateManagement(false)}
                onOpenPrivacy={() => setShowPrivacy(true)}
                onClose={() => {
                  // Settings' ✕ closes the whole widget, same as the main
                  // header's ✕ (DESIGN_SPEC.md Interactions: "✕ in header
                  // closes"). Also reset showStateManagement so reopening the
                  // widget lands back on the thread, not mid-settings.
                  setShowStateManagement(false);
                  handleToggle();
                }}
              />
            ))}

          {/* Hairline redesign (W3.2): Common questions overlay. Rendered
              only while open, same covers-the-whole-shell approach as
              SettingsView above (DESIGN_SPEC.md screen 2's dimmed underlay
              covers the header too). Selecting a row sends the prompt and
              closes itself (QuestionsOverlay.jsx's onClose call inside
              handleSelect) — closing here is just resetting this boolean so
              the next open starts fresh. */}
          {showQuestionsOverlay && (
            <QuestionsOverlay onClose={() => setShowQuestionsOverlay(false)} />
          )}
        </div>
      )}
    </div>
  );
}

export default ChatWidget;