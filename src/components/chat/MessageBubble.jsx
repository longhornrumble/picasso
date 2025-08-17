// MessageBubble.jsx - PERFORMANCE OPTIMIZED: Enhanced with S3 Logo Support and React.memo
import React, { useState, useCallback, useMemo } from "react";
import { useConfig } from "../../hooks/useConfig";
import { useChat } from "../../hooks/useChat";
import { config as environmentConfig } from '../../config/environment';
import FilePreview from "./FilePreview";

// Enhanced avatar URL helper
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
    tenant_id ? environmentConfig.getLegacyS3Url(tenant_id, 'FVC_logo.png') : null,
    tenant_id ? environmentConfig.getLegacyS3Url(tenant_id, 'avatar.png') : null,
    tenant_id ? environmentConfig.getLegacyS3Url(tenant_id, 'logo.png') : null,
    `${environmentConfig.API_BASE_URL}/collateral/default-avatar.png`
  ];
  
  return avatarSources.find(url => url && url.trim()) || `${environmentConfig.API_BASE_URL}/collateral/default-avatar.png`;
};

export default function MessageBubble({ role, content, files = [], actions = [], uploadState, onCancel, metadata = {}, onRetry }) {
  const { config } = useConfig();
  const { addMessage, isTyping, retryMessage } = useChat();
  const [avatarError, setAvatarError] = useState(false);
  const isUser = role === "user";
  
  // Content is already sanitized HTML from ChatProvider
  const html = content || "";
  
  const avatarSrc = getAvatarUrl(config);
  
  const handleActionClick = (action) => {
    if (isTyping) return;
    const messageText = action.value || action.label;
    addMessage({ role: "user", content: messageText });
  };

  const handleAvatarError = () => {
    setAvatarError(true);
  };

  const handleAvatarLoad = () => {
    console.log('✅ Avatar loaded successfully:', avatarSrc);
    setAvatarError(false);
  };

  // Determine if action chips should use full-width layout based on text length
  const getActionChipsLayoutClass = (actions) => {
    if (!actions || actions.length === 0) return '';
    
    // Check if any action has long text (configurable threshold)
    const maxShortTextLength = config?.action_chips?.short_text_threshold || 16;
    const hasLongText = actions.some(action => 
      (action.label || '').length > maxShortTextLength
    );
    
    return hasLongText ? 'long-text' : '';
  };

  return (
    <div className={`message ${isUser ? 'user' : 'bot'}`}>
      <div className="message-content">
        {/* Bot message header with avatar and name - inside bubble */}
        {!isUser && (
          <div className="message-header">
            <div className="message-avatar">
              {!avatarError && (
                <img 
                  src={avatarSrc}
                  onError={handleAvatarError}
                  onLoad={handleAvatarLoad}
                  alt="Avatar"
                  crossOrigin="anonymous"
                />
              )}
            </div>
            <div className="message-sender-name">
              {config?.branding?.bot_name || config?.branding?.chat_title || 'Assistant'}
            </div>
          </div>
        )}

        {/* Text Content */}
        {content && (
          <div className="message-text" dangerouslySetInnerHTML={{ __html: html }} />
        )}

        {/* Retry button for failed messages */}
        {metadata.can_retry && !metadata.retry_failed && (
          <button 
            className="retry-button"
            onClick={() => {
              if (onRetry) {
                onRetry();
              } else if (retryMessage) {
                retryMessage(metadata.messageId);
              }
            }}
            disabled={isTyping}
          >
            Try again
          </button>
        )}

        {/* Action Chips - Only for assistant/bot messages */}
        {(role === "assistant" || role === "bot") && actions && actions.length > 0 && (
  <div className={`action-chips ${getActionChipsLayoutClass(actions)}`}>
    {actions.slice(0, config?.action_chips?.max_display || 5).map((action, index) => (
      <button
        key={index}
        onClick={() => handleActionClick(action)}
        disabled={isTyping}
        className="action-chip"
      >
        {action.label}
      </button>
    ))}
  </div>
)}

        {/* File Attachments */}
        {files && files.length > 0 && (
          <div className="file-attachments">
            {files.map((file, index) => (
              <FilePreview 
                key={index} 
                file={file} 
                uploadState={uploadState}
                onCancel={onCancel}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
