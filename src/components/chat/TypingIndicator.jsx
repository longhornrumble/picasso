// TypingIndicator.jsx - Enhanced with S3 Logo Support
import React, { useState } from "react";
import { useConfig } from "../../hooks/useConfig";
import { config as environmentConfig } from '../../config/environment';

// Same avatar helper as MessageBubble
const getAvatarUrl = (config) => {
  const { tenant_id, branding, _cloudfront, tenant_hash } = config || {};
  
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
  const avatarUrl = avatarError ? `url(${environmentConfig.API_BASE_URL}/collateral/default-avatar.png)` : `url(${avatarSrc})`;

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