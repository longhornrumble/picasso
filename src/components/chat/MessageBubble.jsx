// MessageBubble.jsx — Streaming-aware bubble with imperative writer
import React, { useState, useRef, useEffect, useMemo, useCallback, useLayoutEffect } from "react";
import { useConfig } from "../../hooks/useConfig";
import { useChat } from "../../hooks/useChat";
import { config as environmentConfig } from "../../config/environment";
import FilePreview from "./FilePreview";
import { streamingRegistry } from "../../utils/streamingRegistry";

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
}) {
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
    if (typeof isStreamingProp === 'boolean') return isStreamingProp;
    const metaFlag = (metadata.isStreaming === true) || (metadata.streaming === true) || (metadata.status === 'streaming');
    const registryFlag = (typeof streamingRegistry?.isActive === 'function') ? !!streamingRegistry.isActive(messageId) : false;
    return !!(metaFlag || registryFlag);
  }, [isStreamingProp, metadata, messageId]);

  try { console.log('[Bubble] render flags', { id: messageId, streamingFlag, hasContent: !!content, len: (content || '').length }); } catch {}

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
      console.log('[Bubble] mount: tag stream id', { id: messageId, hasAttr: el.hasAttribute('data-stream-id') });
    } catch {}

    // Remove any children; streaming will be managed imperatively
    while (el.firstChild) el.removeChild(el.firstChild);

    const tn = document.createTextNode('\u200B'); // seed with ZWSP for immediate paint
    el.appendChild(tn);
    textNodeRef.current = tn;
    lastLenRef.current = 1;
    bufferRef.current = '';

    try { console.log('[Bubble] streaming text node created', { id: messageId, nodeType: tn.nodeType }); } catch {}
    try { console.log('[Bubble] streaming container ready', { id: messageId, className: el.className, hasStreamId: el.hasAttribute('data-stream-id') }); } catch {}

    return () => {
      textNodeRef.current = null;
      bufferRef.current = '';
      lastLenRef.current = 0;
    };
  }, [streamingFlag, messageId]);

  useEffect(() => {
    if (streamingFlag) scheduleCommit();
  }, [streamingFlag, scheduleCommit]);

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
    if (!streamingFlag || !messageId) return;

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
      try {
        // Write directly to the element; this is the most robust and avoids
        // any Text-node replacement edge cases.
        const nextText = bufferRef.current.length ? bufferRef.current : '\u200B';
        if (elNode.textContent !== nextText) {
          elNode.textContent = nextText;
        }
        lastLenRef.current = nextText.length;
        try { console.log('[Bubble] writeAccumulated -> el.textContent set', { id: messageId, len: lastLenRef.current }); } catch {}
      } catch {
        // Fallback: ensure at least something is visible
        try { elNode.textContent = bufferRef.current || '\u200B'; } catch {}
        lastLenRef.current = (elNode.textContent || '').length;
      }
      scheduleCommit();
    };

    const handleChunk = (incoming) => {
      if (incoming == null) return;
      const str = typeof incoming === 'string' ? incoming : String(incoming);
      writeAccumulated(str);
    };

    const handleEnd = () => {
      try { console.log('[Bubble] onEnd', { id: messageId, len: bufferRef.current.length }); } catch {}
    };

    const unsubscribe = streamingRegistry.subscribe(messageId, handleChunk, handleEnd);

    // Replay any already-accumulated text immediately (in case we mounted late)
    const snapshot = streamingRegistry.getAccumulated?.(messageId);
    if (snapshot && snapshot.length) writeAccumulated(String(snapshot));

    return () => {
      try { unsubscribe && unsubscribe(); } catch {}
    };
  }, [streamingFlag, messageId, scheduleCommit, resolveLiveEl]);

  useEffect(() => {
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
          className={`message-text ${streamingFlag ? 'streaming' : ''}`}
          data-streaming={streamingFlag ? "true" : "false"}
          data-stream-id={messageId}
          data-was-streamed={metadata?.streamCompleted ? "true" : "false"}
          aria-live="polite"
          role="article"
          suppressHydrationWarning
          // For messages that were streamed, content is managed imperatively
          // For non-streamed messages, use React's dangerouslySetInnerHTML
          dangerouslySetInnerHTML={
            (!streamingFlag && !metadata?.streamCompleted && content) 
              ? { __html: content } 
              : undefined
          }
          style={{
            display: "block",
            visibility: "visible",
            opacity: 1,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            transition: "none",
            willChange: streamingFlag ? "contents" : "auto",
            contentVisibility: "visible",
            contain: "none",
            isolation: "auto"
          }}
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
