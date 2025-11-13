// MessageBubble.jsx — Streaming-aware bubble with imperative writer
import React, { useState, useRef, useEffect, useMemo, useCallback, useLayoutEffect, useContext } from "react";
import { useConfig } from "../../hooks/useConfig";
import { useChat } from "../../hooks/useChat";
import FormModeContext, { useFormMode } from "../../context/FormModeContext";
import { config as environmentConfig } from "../../config/environment";
import FilePreview from "./FIlePreview";  // Note: File has unusual capitalization
import { streamingRegistry } from "../../utils/streamingRegistry";
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import CTAButton, { CTAButtonGroup } from './CTAButton';
import FormCompletionCard from '../forms/FormCompletionCard';

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
  ctaButtons = [],  // CTA buttons from backend
  cards = [],       // Response cards from backend
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
  const { config } = useConfig();
  const { isFormMode } = useFormMode();
  const { addMessage, sendMessage, isTyping, retryMessage, recordFormCompletion } = useChat();
  const formMode = useContext(FormModeContext);
  const [avatarError, setAvatarError] = useState(false);

  // Track which CTA buttons have been clicked (by button ID) for this message
  const [clickedButtonIds, setClickedButtonIds] = useState(new Set());
  // Track if ANY button in this message has been clicked (disables all buttons)
  const [anyButtonClicked, setAnyButtonClicked] = useState(false);

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

  // Debug restored message rendering
  if (role === "assistant" && content) {
    console.log('🎯 Bot message render check:', {
      id: explicitId || messageIdProp,
      streamingFlag,
      renderMode,
      hasContent: !!content,
      contentLength: content?.length,
      willRender: (!streamingFlag) && typeof content === 'string' && content.length > 0
    });
  }

  // try { console.log('[Bubble] render flags', { id: messageId, streamingFlag, hasContent: !!content, len: (content || '').length }); } catch {}

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
      
      // Full markdown processing for streaming content
      try {
        let html = nextText;
        
        // Process headers (H1-H6) first
        html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
        html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
        html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
        html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
        html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');
        
        // Process markdown links BEFORE auto-linking to prevent double processing
        // This must happen before auto-link to avoid matching URLs inside markdown links
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
        
        // Now auto-link plain URLs (but not those already in HTML tags)
        // Negative lookbehind to avoid URLs already in href="..." or already linked
        html = html.replace(/(?<!href=")(?<!>)(https?:\/\/[^\s<"]+)(?![^<]*<\/a>)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
        
        // Process lists - preserve as single block without extra line breaks
        const lines = html.split('\n');
        let result = [];
        let inList = false;
        let listType = null;
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const bulletMatch = line.match(/^\s*[-*+]\s+(.+)$/);
          const numberMatch = line.match(/^\s*(\d+)\.\s+(.+)$/);
          
          if (bulletMatch) {
            // Process any inline formatting in the list item
            let itemContent = bulletMatch[1]
              .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
              .replace(/__([^_]+)__/g, '<strong>$1</strong>')
              .replace(/\*([^*]+)\*/g, '<em>$1</em>')
              .replace(/_([^_]+)_/g, '<em>$1</em>')
              .replace(/`([^`]+)`/g, '<code>$1</code>');
            
            if (!inList || listType !== 'ul') {
              if (inList) result.push(`</${listType}>`);
              result.push('<ul>');
              inList = true;
              listType = 'ul';
            }
            result.push(`<li>${itemContent}</li>`);
          } else if (numberMatch) {
            // Process any inline formatting in the list item
            let itemContent = numberMatch[2]
              .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
              .replace(/__([^_]+)__/g, '<strong>$1</strong>')
              .replace(/\*([^*]+)\*/g, '<em>$1</em>')
              .replace(/_([^_]+)_/g, '<em>$1</em>')
              .replace(/`([^`]+)`/g, '<code>$1</code>');
            
            if (!inList || listType !== 'ol') {
              if (inList) result.push(`</${listType}>`);
              result.push('<ol>');
              inList = true;
              listType = 'ol';
            }
            result.push(`<li>${itemContent}</li>`);
          } else {
            // Not a list item
            if (inList) {
              result.push(`</${listType}>`);
              inList = false;
              listType = null;
            }
            
            // Only add line breaks between non-list paragraphs
            if (line.trim() === '') {
              result.push('<br>');
            } else {
              result.push(line);
            }
          }
        }
        
        // Close any open list
        if (inList) {
          result.push(`</${listType}>`);
        }
        
        html = result.join('');
        
        // Process remaining inline formatting (for non-list content)
        // Bold/strong
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
        
        // Italic/emphasis  
        html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
        html = html.replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>');
        
        // Code blocks (multi-line)
        html = html.replace(/```([^`]*)```/gs, '<pre><code>$1</code></pre>');
        
        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // Blockquotes
        html = html.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');
        
        // Horizontal rules
        html = html.replace(/^([-*_]){3,}$/gm, '<hr>');
        
        // Paragraphs - wrap non-HTML content in <p> tags for better spacing
        // Split by double newlines for paragraph detection
        const paragraphs = html.split(/\n\n+/);
        html = paragraphs.map(p => {
          // Don't wrap if it's already HTML (starts with <)
          if (p.trim().startsWith('<')) return p;
          // Don't wrap empty lines
          if (p.trim() === '') return '';
          // Wrap text content in paragraph
          return `<p>${p.replace(/\n/g, ' ')}</p>`;
        }).join('');
        
        // Apply HTML to element with streaming-formatted wrapper for CSS
        // This ensures all theme.css rules for streaming content are applied
        elNode.innerHTML = `<div class="streaming-formatted">${html}</div>`;
        console.log('[Bubble] writeAccumulated -> el.innerHTML set with streaming-formatted wrapper', { id: messageId, len: nextText.length });
      } catch (err) {
        // Fallback to plain text if processing fails
        console.error('[Bubble] Error with inline markdown:', err);
        elNode.textContent = nextText;
        console.log('[Bubble] writeAccumulated -> el.textContent set (fallback)', { id: messageId, len: nextText.length });
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
      try { console.log('[Bubble] onEnd', { id: messageId, len: bufferRef.current.length }); } catch {}
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

    // Include routing metadata if target_branch is specified
    const messagePayload = {
      role: "user",
      content: messageText
    };

    if (action.target_branch) {
      messagePayload.metadata = {
        action_chip_triggered: true,  // Tier 1: Action chip routing
        target_branch: action.target_branch,
        action_chip_id: action.id || action.label
      };
      console.log('[MessageBubble] Action chip clicked with routing metadata:', {
        target_branch: action.target_branch,
        metadata: messagePayload.metadata
      });
    }

    addMessage(messagePayload);
  };

  const handleCtaClick = (cta) => {
    if (isTyping) return;

    // Mark this button as clicked AND disable all buttons in this message
    const buttonId = cta.id || cta.formId || cta.form_id || cta.label;
    setClickedButtonIds(prev => new Set([...prev, buttonId]));
    setAnyButtonClicked(true); // Disable all buttons in this message

    console.log('[MessageBubble] CTA clicked - full data:', JSON.stringify(cta, null, 2));
    console.log('[MessageBubble] CTA properties:', {
      buttonId,
      action: cta.action,
      type: cta.type,
      formId: cta.formId,
      form_id: cta.form_id,
      label: cta.label,
      fields: cta.fields,
      hasFormMode: !!formMode,
      hasStartFormWithConfig: !!(formMode && formMode.startFormWithConfig)
    });

    // No label-based form detection - all CTAs must have explicit action in config

    // Handle different CTA action types
    if (cta.action === 'resume_form') {
      // Resume a suspended form
      console.log('[MessageBubble] Resume form clicked:', cta.formId);
      if (formMode && formMode.resumeForm) {
        formMode.resumeForm(cta.formId);
      }
      return;
    } else if (cta.action === 'cancel_form') {
      // Cancel a suspended form
      console.log('[MessageBubble] Cancel form clicked:', cta.formId);
      if (formMode && formMode.cancelForm) {
        formMode.cancelForm();
      }
      return;
    } else if (cta.action === 'switch_form') {
      // Switch from suspended form to new form
      console.log('[MessageBubble] Switch form clicked:', {
        newFormId: cta.formId,
        cancelPreviousForm: cta.cancelPreviousForm
      });

      // Cancel the previous form if specified
      if (cta.cancelPreviousForm && formMode && formMode.cancelForm) {
        formMode.cancelForm();
      }

      // Now start the new form (fall through to form trigger logic)
      cta.action = 'start_form';
    }

    if (cta.action === 'send_query' && cta.query) {
      // Send a query to Bedrock (UX shortcut button)
      console.log('[MessageBubble] Send query clicked:', cta.query);
      if (sendMessage) {
        // Pass CTA metadata for explicit routing
        sendMessage(cta.query, {
          cta_triggered: true,
          cta_id: cta.id || cta.cta_id,
          cta_action: cta.action
        });
      }
      return;
    } else if (cta.action === 'external_link' && cta.url) {
      window.open(cta.url, '_blank', 'noopener,noreferrer');
    } else if (cta.action === 'start_form' || cta.action === 'form_trigger' || cta.type === 'form_trigger') {
      // Get form ID from CTA
      let formId = cta.formId || cta.form_id || cta.id;

      // Trigger form mode using FormModeContext
      console.log('[MessageBubble] Form trigger detected:', {
        formId,
        action: cta.action,
        type: cta.type,
        hasFields: !!cta.fields,
        fieldsCount: cta.fields?.length
      });

      if (!formId) {
        console.error('[MessageBubble] No form ID found in CTA:', cta);
        return;
      }

      if (formMode && formMode.startFormWithConfig) {
        // Build dynamic form_id → config key mapping from tenant config
        let configKey = formId;
        if (config?.conversational_forms) {
          Object.entries(config.conversational_forms).forEach(([key, formConfig]) => {
            if (formConfig.form_id === formId) {
              configKey = key;
            }
          });
        }

        // ALWAYS prefer config fields over CTA fields (config has eligibility gates)
        let fields = [];
        if (config?.conversational_forms?.[configKey]) {
          fields = config.conversational_forms[configKey].fields || [];
          console.log('[MessageBubble] ✅ Loading fields from CONFIG for form:', formId, '(mapped to', configKey, ')');
          console.log('[MessageBubble] Field count:', fields.length);
          console.log('[MessageBubble] Fields with eligibility gates:', fields.filter(f => f.eligibility_gate).map(f => f.id));
        } else {
          // Fallback to CTA fields only if config not available
          fields = cta.fields || [];
          console.log('[MessageBubble] ⚠️ Config not found, using CTA fields. configKey:', configKey);
        }

        // Error if no fields found - don't use hardcoded fallbacks
        if (!fields || fields.length === 0) {
          console.error('[MessageBubble] No fields found for form:', formId, 'configKey:', configKey);
          console.error('[MessageBubble] Config must include field definitions for all forms');
          return;
        }

        // Use the form config from the CTA button or build it
        const formConfig = {
          form_id: formId,
          title: cta.label || cta.title || config?.conversational_forms?.[configKey]?.title || 'Application Form',
          form_title: config?.conversational_forms?.[configKey]?.form_title,
          form_subtitle: config?.conversational_forms?.[configKey]?.form_subtitle,
          introduction: config?.conversational_forms?.[configKey]?.introduction,
          fields: fields,
          welcome_message: cta.welcome_message || config?.conversational_forms?.[configKey]?.welcome_message || `Great! Let's get started with your application.`,
          post_submission: config?.conversational_forms?.[configKey]?.post_submission
        };

        console.log('[MessageBubble] Starting form with config:', formConfig);
        const success = formMode.startFormWithConfig(formId, formConfig);
        console.log('[MessageBubble] Form start result:', success);
        if (!success) {
          console.error('[MessageBubble] Failed to start form:', formId);
        }
        // Note: Introduction and field prompts are shown in FormFieldPrompt component, not as messages
      } else if (formMode && formMode.startForm) {
        // Try legacy method
        const success = formMode.startForm(formId);
        if (!success) {
          console.error('[MessageBubble] Failed to start form:', formId);
        }
      } else {
        // Fallback if FormModeContext not available
        console.log('[MessageBubble] FormModeContext not available, sending as message');
        if (addMessage) {
          addMessage({
            role: "user",
            content: `I'd like to apply`,
            metadata: { formTrigger: cta.formId }
          });
        }
      }
    } else if (cta.action === 'show_info' && addMessage) {
      // Send as a user prompt to get info with CTA metadata
      const query = cta.prompt || cta.text || cta.label;
      if (sendMessage) {
        sendMessage(query, {
          cta_triggered: true,
          cta_id: cta.id || cta.cta_id,
          cta_action: cta.action
        });
      }
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
            (!streamingFlag) && typeof content === 'string' && content.length
              ? { __html: content }
              : undefined
          }
          style={{
            display: "block",
            visibility: "visible",
            opacity: 1,
            whiteSpace: "normal",
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

        {/* CTA Buttons (assistant/bot only) */}
        {(role === "assistant" || role === "bot") && ctaButtons && ctaButtons.length > 0 && (
          <CTAButtonGroup
            ctas={ctaButtons}
            onCtaClick={handleCtaClick}
            disabled={isTyping || anyButtonClicked}
            clickedButtonIds={clickedButtonIds}
          />
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
