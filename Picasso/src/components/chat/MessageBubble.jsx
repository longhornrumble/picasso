// MessageBubble.jsx — Streaming-aware bubble with imperative writer
import React, { useState, useRef, useEffect, useMemo, useCallback, useLayoutEffect } from "react";
import { useConfig } from "../../hooks/useConfig";
import { useChat } from "../../hooks/useChat";
import { config as environmentConfig } from "../../config/environment";
import FilePreview from "./FilePreview";
import ResponseCard from "./ResponseCard";
import { CTAButtonGroup } from "./CTAButton";
import { streamingRegistry } from "../../utils/streamingRegistry";
import { marked } from 'marked';
import "./MessageBubble.css";
import DOMPurify from 'dompurify';

// Configure marked for streaming markdown
marked.setOptions({
  gfm: true,
  breaks: true,
  mangle: false,
  headerIds: false,
  pedantic: false,
  smartypants: false,
  sanitize: false
});

// Simple markdown processor for streaming
const processStreamingMarkdown = (text) => {
  if (!text) return '';
  
  try {
    // Convert markdown to HTML
    const html = marked.parse(text);
    
    // Sanitize the HTML
    const safeHtml = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'strike', 'del', 's',
        'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td'
      ],
      ALLOWED_ATTR: [
        'href', 'title', 'target', 'rel', 'alt', 'src',
        'width', 'height', 'class', 'start'
      ],
      ADD_ATTR: ['target', 'rel'],
      ALLOW_DATA_ATTR: false
    });
    
    // Add target="_blank" to links
    return safeHtml.replace(
      /<a\s+([^>]*href=["'](?:https?:|mailto:|tel:)[^"']+["'][^>]*)>/gi,
      (match, attrs) => {
        if (!/target=/i.test(attrs)) {
          return `<a ${attrs} target="_blank" rel="noopener noreferrer">`;
        }
        return match;
      }
    );
  } catch (err) {
    console.error('[Bubble] Markdown processing error:', err);
    return DOMPurify.sanitize(text);
  }
};

// --- Avatar URL helper (unchanged, but slightly tidied) ---
const getAvatarUrl = (config) => {
  const { tenant_id, branding, _cloudfront } = config || {};
  const avatarSources = [
    branding?.avatar_url,
    branding?.logo_url,
    branding?.bot_avatar_url,
    branding?.icon,
    branding?.custom_icons?.bot_avatar,
    _cloudfront?.urls?.avatar,
    tenant_id ? `${environmentConfig.API_BASE_URL}/tenants/${tenant_id}/avatar.png` : null,
    tenant_id ? `${environmentConfig.API_BASE_URL}/tenants/${tenant_id}/logo.png` : null,
    tenant_id ? environmentConfig.getLegacyS3Url(tenant_id, "FVC_logo.png") : null,
    tenant_id ? environmentConfig.getLegacyS3Url(tenant_id, "avatar.png") : null,
    tenant_id ? environmentConfig.getLegacyS3Url(tenant_id, "logo.png") : null,
    `${environmentConfig.API_BASE_URL}/collateral/default-avatar.png`,
  ];
  return avatarSources.find((url) => url && url.trim()) || `${environmentConfig.API_BASE_URL}/collateral/default-avatar.png`;
};

/**
 * Props contract notes:
 * - `content` should be sanitized HTML for finalized messages (from ChatProvider).
 * - Streaming placeholder messages should provide a stable id via one of:
 *    metadata.id | metadata.messageId | metadata.streamId | id
 *   and set a streaming flag in either `metadata.isStreaming` or the `isStreaming` prop.
 */
export default function MessageBubble({
  role,
  content,
  files = [],
  actions = [],
  cards = [], // Smart response cards from KB inventory
  ctaButtons: ctaButtonsProp, // Context-aware CTA buttons from response enhancer
  uploadState,
  onCancel,
  metadata = {},
  onRetry,
  // Optional explicit flag; if not provided we infer from metadata and content
  isStreaming: isStreamingProp,
  id: explicitId,
  messageId: messageIdProp,
  streamId: streamIdProp,
  dataStreamId: dataStreamIdProp,
  // New prop to control rendering mode
  renderMode = "static", // "static" or "streaming"
}) {
  // Debug: Log raw prop received
  console.log('[MessageBubble] Raw ctaButtonsProp:', {
    messageIdProp,
    role,
    ctaButtonsProp,
    isArray: Array.isArray(ctaButtonsProp),
    length: ctaButtonsProp?.length,
    type: typeof ctaButtonsProp
  });

  // Process CTA buttons safely - don't default to empty array during destructuring
  const ctaButtons = Array.isArray(ctaButtonsProp) ? ctaButtonsProp : [];

  const { config } = useConfig();
  const { addMessage, isTyping, retryMessage } = useChat();
  const [avatarError, setAvatarError] = useState(false);

  const isUser = role === "user";
  const avatarSrc = getAvatarUrl(config);

  // --- Resolve message identity & streaming state ---
  const messageId = useMemo(() => {
    return (
      streamIdProp ||
      dataStreamIdProp ||
      messageIdProp ||
      explicitId ||
      metadata.streamId ||
      metadata.dataStreamId ||
      metadata.messageId ||
      metadata.id ||
      metadata?.metadata?.id ||
      undefined
    );
  }, [streamIdProp, dataStreamIdProp, messageIdProp, explicitId, metadata]);

  const streamingFlag = useMemo(() => {
    // Use renderMode to determine if streaming is enabled
    if (renderMode !== "streaming") {
      return false;
    }
    
    if (typeof isStreamingProp === 'boolean') return isStreamingProp;
    const metaFlag = (metadata.isStreaming === true) || (metadata.streaming === true) || (metadata.status === 'streaming');
    const registryFlag = (typeof streamingRegistry?.isActive === 'function') ? !!streamingRegistry.isActive(messageId) : false;
    return !!(metaFlag || registryFlag);
  }, [isStreamingProp, metadata, messageId, renderMode]);


  // --- Streaming DOM refs ---
  const streamingContainerRef = useRef(null); // wraps the text node
  const rafRef = useRef(0);
  const subscribedRef = useRef(false);

  // --- Imperative streaming refs ---
  const textNodeRef = useRef(null);     // The single Text node we write into
  const lastLenRef = useRef(0);         // Last committed text length
  const bufferRef = useRef("");        // Accumulated buffer for delta calc

  // rAF commit to avoid microtask starvation and let the browser paint
  const scheduleCommit = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      // Auto-scroll only; text writes are done immediately for fastest paint
      try {
        const scroller = streamingContainerRef.current?.closest?.(".messages, .chat-messages, .message-list, .scroll-container");
        if (scroller) scroller.scrollTop = scroller.scrollHeight;
      } catch (_) {}
    });
  }, []);

  // Ensure a single Text node exists in the streaming container before first paint
  useLayoutEffect(() => {
    // Only create text nodes when in streaming mode
    if (renderMode !== "streaming") {
      return;
    }
    
    if (!streamingFlag) return;
    const el = streamingContainerRef.current;
    if (!el) return;

    // Ensure the streaming node is tagged with a stable id for rebinding
    try {
      if (messageId != null) {
        el.setAttribute('data-stream-id', String(messageId));
      }
      // Also mirror on the nearest bubble container for fallback queries
      const bubble = el.closest('[data-message-id]');
      if (bubble && messageId != null) {
        bubble.setAttribute('data-message-id', String(messageId));
      }
    } catch {}

    // Remove any children; streaming will be managed imperatively
    while (el.firstChild) el.removeChild(el.firstChild);

    const tn = document.createTextNode('\u200B'); // seed with ZWSP for immediate paint
    el.appendChild(tn);
    textNodeRef.current = tn;
    lastLenRef.current = 1;
    bufferRef.current = '';


    return () => {
      textNodeRef.current = null;
      bufferRef.current = '';
      lastLenRef.current = 0;
    };
  }, [streamingFlag, messageId]);

  useEffect(() => {
    // Only schedule commits when in streaming mode
    if (renderMode !== "streaming") {
      return;
    }
    
    if (streamingFlag) scheduleCommit();
  }, [streamingFlag, scheduleCommit, renderMode]);

  const resolveLiveEl = useCallback(() => {
    const refEl = streamingContainerRef.current;
    if (refEl && refEl.isConnected) return refEl;
    try {
      const doc = refEl?.ownerDocument || (typeof document !== 'undefined' ? document : null);
      if (!doc) return refEl || null;
      // 1) Preferred: by data-stream-id on the element
      if (messageId != null) {
        const sel = `.message-text.streaming[data-stream-id="${messageId}"]`;
        const found = doc.querySelector(sel);
        if (found) {
          streamingContainerRef.current = found;
          return found;
        }
      }
      // 2) Fallback: by bubble container's data-message-id and inner streaming element
      if (messageId != null) {
        const bubbleSel = `[data-message-id="${messageId}"]`;
        const bubble = doc.querySelector(bubbleSel);
        const inner = bubble ? bubble.querySelector('.message-text.streaming') : null;
        if (inner) {
          streamingContainerRef.current = inner;
          return inner;
        }
      }
      // 3) Last resort: take the last streaming element in the DOM (most recent)
      const all = doc.querySelectorAll('.message-text.streaming');
      const last = all && all.length ? all[all.length - 1] : null;
      if (last) {
        streamingContainerRef.current = last;
        return last;
      }
    } catch {}
    return refEl || null;
  }, [messageId]);

  // Subscribe to streamingRegistry using stable id (imperative DOM updates only)
  useEffect(() => {
    // Only subscribe to streaming registry when in streaming mode
    if (renderMode !== "streaming") {
      return;
    }

    if (!streamingFlag || !messageId) return;

    // Reset the ordered list counter for this new message

    let el = resolveLiveEl();

    const ensureTextNode = () => {
      if (textNodeRef.current && textNodeRef.current.nodeType === 3) return textNodeRef.current;
      if (!el) return null;
      const child = el.firstChild;
      if (child && child.nodeType === 3) {
        textNodeRef.current = child;
        return child;
      }
      const tn = document.createTextNode('\u200B');
      el.appendChild(tn);
      textNodeRef.current = tn;
      lastLenRef.current = 1;
      return tn;
    };

    const writeAccumulated = (accum) => {
      let elNode = resolveLiveEl();
      if (elNode && !elNode.hasAttribute('data-stream-id') && messageId != null) {
        try { elNode.setAttribute('data-stream-id', String(messageId)); } catch {}
      }
      if (!elNode) return;
      if (elNode !== streamingContainerRef.current) {
        try { console.warn('[Bubble] Rebound streaming element by data-stream-id', { id: messageId }); } catch {}
      }
      // Keep an internal buffer for debugging and minimal comparisons
      bufferRef.current = accum || '';
      
      const nextText = bufferRef.current.length ? bufferRef.current : '\u200B';
      
      // Simple markdown to HTML for streaming content
      // The server sends markdown text that needs formatting
      try {
        let html = nextText;

        // First, escape any HTML to prevent XSS
        html = html.replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // Convert markdown to basic HTML
        // Headers
        html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

        // Blockquotes (useful for testimonials or important notes)
        html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

        // Horizontal rules (for section breaks)
        html = html.replace(/^---+$/gm, '<hr>');

        // Links - both markdown style and plain URLs
        // Markdown links [text](url)
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
        // Auto-link plain URLs
        html = html.replace(/(^|[^">])(https?:\/\/[^\s<"]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
        // Email links
        html = html.replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '<a href="mailto:$1">$1</a>');

        // Bold and italic (do this after links to avoid conflicts)
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

        // Line breaks (two spaces at end of line = <br>)
        html = html.replace(/  $/gm, '<br>');

        // Lists - handle bullets with various markers and indentation
        html = html.replace(/^(\s*)[-•*+]\s+(.+)$/gm, (match, spaces, content) => {
          const level = Math.floor(spaces.length / 2);
          return `<li data-level="${level}">${content}</li>`;
        });
        html = html.replace(/^(\s*)\d+\.\s+(.+)$/gm, (match, spaces, content) => {
          const level = Math.floor(spaces.length / 2);
          return `<li data-level="${level}" data-ordered="true">${content}</li>`;
        });

        // Wrap consecutive list items in ul/ol tags
        html = html.replace(/((?:<li[^>]*>.*<\/li>\s*)+)/g, (match) => {
          // Check if numbered or bulleted
          if (match.includes('data-ordered="true"')) {
            return '<ol>' + match + '</ol>';
          }
          return '<ul>' + match + '</ul>';
        });

        // Paragraphs - only wrap complete paragraphs during streaming
        // Check if we're still mid-stream (no ending punctuation or still receiving)
        const isLikelyComplete = nextText.match(/[.!?]\s*$/);
        const hasDoubleNewline = html.includes('\n\n');

        if (hasDoubleNewline || isLikelyComplete) {
          // Split by double newlines for proper paragraphs
          const paragraphs = html.split(/\n\n+/);
          html = paragraphs.map((p, idx) => {
            // Don't wrap if already has HTML tags
            if (p.match(/^<[hul]/)) return p;
            // For the last paragraph during streaming, only wrap if it looks complete
            if (idx === paragraphs.length - 1 && !isLikelyComplete && !hasDoubleNewline) {
              return p.trim() || '';
            }
            return p.trim() ? `<p>${p}</p>` : '';
          }).join('\n');
        } else {
          // During active streaming of first paragraph, don't wrap yet
          // Just replace single newlines with spaces for flow
          html = html.replace(/([^>])\n([^<])/g, '$1 $2');
        }

        // Apply formatted HTML
        elNode.innerHTML = `<div class="streaming-formatted">${html}</div>`;
      } catch (err) {
        console.error('[Bubble] Markdown processing error:', err);
        // Fallback to plain text
        const textNode = ensureTextNode();
        if (textNode) {
          textNode.nodeValue = nextText;
        }
      }
      
      lastLenRef.current = nextText.length;
      scheduleCommit();
    };

    const handleChunk = (incoming) => {
      if (incoming == null) return;
      const str = typeof incoming === 'string' ? incoming : String(incoming);
      writeAccumulated(str);
    };

    const handleEnd = () => {
    };

    const unsubscribe = streamingRegistry.subscribe(messageId, handleChunk, handleEnd);

    // Replay any already-accumulated text immediately (in case we mounted late)
    const snapshot = streamingRegistry.getAccumulated?.(messageId);
    if (snapshot && snapshot.length) {
      writeAccumulated(String(snapshot)); // Fire and forget, no await needed
    }

    return () => {
      try { unsubscribe && unsubscribe(); } catch {}
    };
  }, [streamingFlag, messageId, scheduleCommit, resolveLiveEl]);


  useEffect(() => {
    // Only set up mutation observer when in streaming mode
    if (renderMode !== "streaming") {
      return;
    }
    
    if (!streamingFlag || !messageId) return;
    const current = resolveLiveEl();
    if (!current) return;
    const root = current.parentElement || current.closest('.message-content') || current;
    if (!root) return;

    const obs = new MutationObserver(() => {
      const el = streamingContainerRef.current;
      if (!el || !el.isConnected) {
        // Try to find replacement
        const found = resolveLiveEl();
        if (found) {
          try { console.warn('[Bubble] MutationObserver: streaming node replaced; rebound', { id: messageId }); } catch {}
        }
      }
    });
    try { obs.observe(root, { childList: true, subtree: true }); } catch {}
    return () => { try { obs.disconnect(); } catch {} };
  }, [streamingFlag, messageId, resolveLiveEl]);

  const isFinalized = (!streamingFlag && !!content);

  const handleActionClick = (action) => {
    if (isTyping) return;
    const messageText = action.value || action.label;
    addMessage({ role: "user", content: messageText });
  };

  const handleCardAction = (cardAction) => {
    if (isTyping) return;

    // Handle different card action types
    if (cardAction.formType) {
      // Start conversational form
      addMessage({
        role: "user",
        content: `I'd like to ${cardAction.formType.replace('_', ' ')}`,
        metadata: { triggerForm: cardAction.formType }
      });
    } else if (cardAction.action) {
      // Generic action
      addMessage({
        role: "user",
        content: cardAction.action,
        metadata: { cardAction: true }
      });
    }
  };

  const handleCtaClick = (cta) => {
    if (isTyping) return;
    if (!cta) return;

    // Handle different CTA action types
    if (cta.action === 'start_form' && cta.formId) {
      // Trigger conversational form
      addMessage({
        role: "user",
        content: cta.text || cta.label || `I'd like to ${cta.formId.replace('_', ' ')}`,
        metadata: {
          triggerForm: cta.formId,
          ctaAction: true
        }
      });
    } else if (cta.action === 'external_link' && cta.url) {
      // Open external link
      window.open(cta.url, '_blank', 'noopener,noreferrer');
    } else if (cta.action === 'show_info') {
      // Request more information
      addMessage({
        role: "user",
        content: cta.text || cta.label,
        metadata: {
          infoRequest: cta.infoType,
          ctaAction: true
        }
      });
    } else {
      // Default: Send as user message
      addMessage({
        role: "user",
        content: cta.text || cta.label,
        metadata: { ctaAction: true }
      });
    }
  };

  const getActionChipsLayoutClass = (acts) => {
    if (!acts || acts.length === 0) return "";
    const maxShortTextLength = config?.action_chips?.short_text_threshold || 16;
    const hasLongText = acts.some((a) => (a.label || "").length > maxShortTextLength);
    return hasLongText ? "long-text" : "";
  };

  return (
    <div className={`message ${isUser ? "user" : "bot"}`} data-message-id={messageId || undefined}>
      <div className="message-content">
        {/* Bot header with avatar inside bubble */}
        {!isUser && (
          <div className="message-header">
            <div className="message-avatar">
              {!avatarError && (
                <img
                  src={avatarSrc}
                  onError={() => setAvatarError(true)}
                  onLoad={() => setAvatarError(false)}
                  alt="Avatar"
                  crossOrigin="anonymous"
                />
              )}
            </div>
            <div className="message-sender-name">
              {config?.branding?.bot_name || config?.branding?.chat_title || "Assistant"}
            </div>
          </div>
        )}

        {/* Text Content */}
        {/* Single container for entire lifecycle - streaming and markdown */}
        <div
          ref={streamingContainerRef}
          className={`message-text message-content-rendered ${streamingFlag ? 'streaming' : ''}`}
          data-streaming={streamingFlag ? "true" : "false"}
          data-stream-id={messageId}
          data-was-streamed={metadata?.streamCompleted ? "true" : "false"}
          aria-live="polite"
          role="article"
          suppressHydrationWarning
          // For messages that were streamed, content is managed imperatively
          // For non-streamed messages, use React's dangerouslySetInnerHTML
          dangerouslySetInnerHTML={
            (!streamingFlag) && typeof content === 'string' && content.length
              ? { __html: `<div class="streaming-formatted">${content}</div>` } // Wrap in streaming-formatted for CSS rules
              : undefined
          }
        />

        {/* Retry button for failed messages */}
        {metadata.can_retry && !metadata.retry_failed && (
          <button
            className="retry-button"
            onClick={() => {
              if (onRetry) onRetry();
              else if (retryMessage) retryMessage(metadata.messageId || messageId);
            }}
            disabled={isTyping}
          >
            Try again
          </button>
        )}

        {/* Action Chips (assistant/bot only) */}
        {(role === "assistant" || role === "bot") && actions && actions.length > 0 && (
          <div className={`action-chips ${getActionChipsLayoutClass(actions)}`}>
            {actions.slice(0, config?.action_chips?.max_display || 5).map((action, index) => (
              <button key={index} onClick={() => handleActionClick(action)} disabled={isTyping} className="action-chip">
                {action.label}
              </button>
            ))}
          </div>
        )}

        {/* CTA Buttons (assistant/bot only) - Context-aware from response enhancer */}
        {console.log('[MessageBubble] CTA Render Check:', {
          messageId,
          role,
          ctaButtons,
          ctaButtonsLength: ctaButtons?.length,
          shouldRender: (role === "assistant" || role === "bot") && ctaButtons && ctaButtons.length > 0
        })}
        {(role === "assistant" || role === "bot") && ctaButtons && ctaButtons.length > 0 && (
          <CTAButtonGroup
            ctas={ctaButtons}
            onCtaClick={handleCtaClick}
            disabled={isTyping}
          />
        )}

        {/* Smart Response Cards (assistant/bot only) */}
        {(role === "assistant" || role === "bot") && cards && cards.length > 0 && (
          <div className="response-cards-container">
            {cards.map((card, index) => (
              <ResponseCard
                key={index}
                card={card}
                onAction={handleCardAction}
              />
            ))}
          </div>
        )}

        {/* File Attachments */}
        {files && files.length > 0 && (
          <div className="file-attachments">
            {files.map((file, index) => (
              <FilePreview key={index} file={file} uploadState={uploadState} onCancel={onCancel} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
