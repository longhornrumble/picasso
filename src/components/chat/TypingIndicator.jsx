// TypingIndicator.jsx - Enhanced with S3 Logo Support
import React, { useState } from "react";
import { useConfig } from "../../hooks/useConfig";

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

  const handleAvatarError = () => {
    console.log('❌ Typing avatar failed to load:', avatarSrc);
    setAvatarError(true);
  };

  const handleAvatarLoad = () => {
    console.log('✅ Typing avatar loaded successfully:', avatarSrc);
    setAvatarError(false);
  };

  // Set the dynamic avatar URL as a CSS custom property
  const avatarUrl = avatarError ? 'url(https://chat.myrecruiter.ai/collateral/default-avatar.png)' : `url(${avatarSrc})`;

  return (
    <div className="typing-indicator-wrapper">
      {/* Bot Avatar with Error Handling */}
      <div 
        className="bot-avatar"
        style={{ '--dynamic-avatar-url': avatarUrl }}
      >
        {/* Hidden img for error detection */}
        <img 
          src={avatarSrc}
          onError={handleAvatarError}
          onLoad={handleAvatarLoad}
          className="hidden-img"
          alt="Avatar"
        />
      </div>
      
      {/* Typing Bubble */}
      <div className="typing-indicator-content">
        <div className="typing-dot"></div>
        <div className="typing-dot"></div>
        <div className="typing-dot"></div>
      </div>
    </div>
  );
}