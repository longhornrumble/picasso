// MessageBubble.jsx - Enhanced with S3 Logo Support
import React, { useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { useConfig } from "../../context/ConfigProvider";
import { useChat } from "../../context/ChatProvider";
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
    `https://chat.myrecruiter.ai/tenants/${tenant_id}/avatar.png`,
    `https://chat.myrecruiter.ai/tenants/${tenant_id}/logo.png`,
    `https://myrecruiter-picasso.s3.us-east-1.amazonaws.com/tenants/${tenant_id}/FVC_logo.png`,
    `https://myrecruiter-picasso.s3.us-east-1.amazonaws.com/tenants/${tenant_id}/avatar.png`,
    `https://myrecruiter-picasso.s3.us-east-1.amazonaws.com/tenants/${tenant_id}/logo.png`,
    'https://chat.myrecruiter.ai/collateral/default-avatar.png'
  ];
  
  return avatarSources.find(url => url && url.trim()) || 'https://chat.myrecruiter.ai/collateral/default-avatar.png';
};

export default function MessageBubble({ role, content, files = [], actions = [], uploadState, onCancel }) {
  const { config } = useConfig();
  const { addMessage, isTyping } = useChat();
  const [avatarError, setAvatarError] = useState(false);
  const isUser = role === "user";
  
  // Only process markdown if there's content
  const html = content ? DOMPurify.sanitize(marked.parse(content)) : "";
  
  const avatarSrc = getAvatarUrl(config);
  
  const handleActionClick = (action) => {
    if (isTyping) return;
    const messageText = action.value || action.label;
    addMessage({ role: "user", content: messageText });
  };

  const handleAvatarError = () => {
    console.log('❌ Avatar failed to load:', avatarSrc);
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
