// TypingIndicator.jsx - Enhanced with S3 Logo Support
import React, { useState } from "react";
import { useConfig } from "../../context/ConfigProvider";

// Same avatar helper as MessageBubble
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

export default function TypingIndicator() {
  const { config } = useConfig();
  const [avatarError, setAvatarError] = useState(false);
  
  const avatarSrc = getAvatarUrl(config);
  const borderRadius = config?.branding?.border_radius || "12px";
  const botBubbleColor = config?.branding?.bot_bubble_color || "#f3f4f6";
  const avatarShape = config?.branding?.avatar_shape === 'circle' ? '50%' : borderRadius;

  const handleAvatarError = () => {
    console.log('❌ Typing avatar failed to load:', avatarSrc);
    setAvatarError(true);
  };

  const handleAvatarLoad = () => {
    console.log('✅ Typing avatar loaded successfully:', avatarSrc);
    setAvatarError(false);
  };

  return (
    <>
      <style>
        {`
          .typing-indicator-wrapper {
            display: flex;
            margin-bottom: 0.75rem;
            line-height: 1.4;
            justify-content: flex-start;
          }

          .typing-indicator-content {
            max-width: 75%;
            padding: 12px 16px;
            font-size: 14px;
            overflow-wrap: break-word;
            word-wrap: break-word;
            display: flex;
            align-items: center;
            gap: 4px;
          }

          .typing-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background-color: #9ca3af;
            animation: typing-bounce 1.4s infinite ease-in-out;
          }

          .typing-dot:nth-child(2) {
            animation-delay: 0.2s;
          }

          .typing-dot:nth-child(3) {
            animation-delay: 0.4s;
          }

          @keyframes typing-bounce {
            0%, 60%, 100% {
              transform: translateY(0);
              opacity: 0.4;
            }
            30% {
              transform: translateY(-8px);
              opacity: 1;
            }
          }
        `}
      </style>
      
      <div className="typing-indicator-wrapper">
        {/* Bot Avatar with Error Handling */}
        <div 
          className="bot-avatar"
          style={{
            width: '32px',
            height: '32px',
            backgroundImage: avatarError ? 'url(https://chat.myrecruiter.ai/collateral/default-avatar.png)' : `url(${avatarSrc})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundColor: '#6b7280',
            borderRadius: avatarShape,
            marginRight: '8px',
            marginTop: '4px',
            flexShrink: 0
          }}
        >
          {/* Hidden img for error detection */}
          <img 
            src={avatarSrc}
            onError={handleAvatarError}
            onLoad={handleAvatarLoad}
            style={{ display: 'none' }}
            alt="Avatar"
          />
        </div>
        
        {/* Typing Bubble */}
        <div 
          className="typing-indicator-content"
          style={{
            backgroundColor: botBubbleColor,
            borderRadius: borderRadius
          }}
        >
          <div className="typing-dot"></div>
          <div className="typing-dot"></div>
          <div className="typing-dot"></div>
        </div>
      </div>
    </>
  );
}