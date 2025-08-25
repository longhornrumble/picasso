/**
 * Simplified Message Bubble Component
 * 
 * This version has NO streaming logic - it just renders content.
 * The streaming logic is handled entirely by the StreamingChatProvider
 * and StreamingRegistry, not by individual components.
 * 
 * This makes the component:
 * - Much simpler to understand and maintain
 * - Faster to render (no streaming checks)
 * - More predictable (content is always just rendered as-is)
 */

import React, { useState } from "react";
import { useConfig } from "../../hooks/useConfig";
import { useChat } from "../../hooks/useChat";
import { config as environmentConfig } from "../../config/environment";
import FilePreview from "./FilePreview";

/**
 * Get avatar URL with fallbacks
 */
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
    `${environmentConfig.API_BASE_URL}/collateral/default-avatar.png`,
  ];
  return avatarSources.find((url) => url && url.trim()) || 
    `${environmentConfig.API_BASE_URL}/collateral/default-avatar.png`;
};

/**
 * Simple Message Bubble Component
 * 
 * Props:
 * - role: 'user' | 'assistant' | 'error'
 * - content: Pre-processed HTML content (already sanitized by provider)
 * - files: Array of file attachments
 * - actions: Array of action chips
 * - uploadState: File upload state
 * - onCancel: Cancel callback for uploads
 * - metadata: Additional message metadata
 * - onRetry: Retry callback for errors
 * - id: Message ID
 */
export default function MessageBubbleSimple({
  role,
  content,
  files = [],
  actions = [],
  uploadState,
  onCancel,
  metadata = {},
  onRetry,
  id,
}) {
  const { config } = useConfig();
  const { addMessage, isTyping, retryMessage } = useChat();
  const [avatarError, setAvatarError] = useState(false);

  const isUser = role === "user";
  const isError = role === "error";
  const avatarSrc = getAvatarUrl(config);

  // Handle action chip clicks
  const handleActionClick = (action) => {
    if (action.type === "link" && action.url) {
      window.open(action.url, "_blank", "noopener,noreferrer");
    } else if (action.type === "message" && action.text) {
      addMessage({
        role: "user",
        content: action.text,
      });
    }
  };

  // Handle retry for error messages
  const handleRetry = () => {
    if (onRetry && id) {
      onRetry(id);
    } else if (retryMessage && id) {
      retryMessage(id);
    }
  };

  return (
    <div 
      className={`message-bubble ${isUser ? "user" : "assistant"} ${isError ? "error" : ""}`}
      data-message-id={id}
    >
      {/* Avatar for assistant messages */}
      {!isUser && !isError && (
        <div className="avatar-container">
          {!avatarError ? (
            <img
              src={avatarSrc}
              alt="Assistant"
              className="bot-avatar"
              onError={() => setAvatarError(true)}
            />
          ) : (
            <div className="bot-avatar-placeholder">AI</div>
          )}
        </div>
      )}
      
      {/* Message Content Container */}
      <div className="message-content-wrapper">
        {/* Message text content */}
        <div className="message-text-container">
          {/* For HTML content (already processed by provider) */}
          {content && (
            <div 
              className="message-text"
              dangerouslySetInnerHTML={{ __html: content }}
            />
          )}
          
          {/* File uploads in progress */}
          {uploadState && (
            <div className="upload-state">
              <div className="upload-progress">
                <span>Uploading {uploadState.fileName}...</span>
                {uploadState.progress !== undefined && (
                  <span className="progress-percent">
                    {Math.round(uploadState.progress)}%
                  </span>
                )}
              </div>
              {onCancel && (
                <button 
                  onClick={onCancel}
                  className="cancel-upload"
                  aria-label="Cancel upload"
                >
                  ✕
                </button>
              )}
            </div>
          )}
          
          {/* File previews */}
          {files && files.length > 0 && (
            <div className="file-attachments">
              {files.map((file, index) => (
                <FilePreview 
                  key={index} 
                  file={file} 
                  onRemove={null}
                />
              ))}
            </div>
          )}
        </div>
        
        {/* Action chips */}
        {actions && actions.length > 0 && (
          <div className="action-chips">
            {actions.map((action, index) => (
              <button
                key={index}
                className="action-chip"
                onClick={() => handleActionClick(action)}
                disabled={isTyping}
              >
                {action.icon && (
                  <span className="action-icon">{action.icon}</span>
                )}
                <span className="action-text">{action.text}</span>
              </button>
            ))}
          </div>
        )}
        
        {/* Error retry button */}
        {isError && metadata?.canRetry && (
          <div className="error-actions">
            <button 
              onClick={handleRetry}
              className="retry-button"
              disabled={isTyping}
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Export for testing
export { MessageBubbleSimple };