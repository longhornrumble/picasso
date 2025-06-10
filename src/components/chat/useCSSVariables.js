// src/hooks/useCSSVariables.js - Platform-Neutral Multi-Tenant CSS System (COMPLETE)
import { useEffect } from 'react';
import { useConfig } from '../../context/ConfigProvider';

export function useCSSVariables(config) {
  useEffect(() => {
    if (!config) {
      console.log('⏳ Waiting for config to load...');
      return;
    }

    console.log('🎨 Injecting CSS variables for tenant:', config.tenant_id);
    console.log('📊 Config structure:', {
      hasBranding: !!config.branding,
      hasFeatures: !!config.features,
      primaryColor: config.branding?.primary_color || config.primary_color || 'using-default',
      tenantId: config.tenant_id
    });

    const root = document.documentElement;
    const branding = config.branding || config;
    const features = config.features || {};

    // Clean feature detection with new config structure
    const quickHelpEnabled = config?.quick_help?.enabled !== false;
    const actionChipsEnabled = config?.action_chips?.enabled !== false;
    const calloutEnabled = features.callout !== false;

    // COMPLETE CSS Variables Mapping - All Features + Platform Neutral Defaults
    const cssVariables = {
      
      /* === CORE COLORS === */
      '--primary-color': branding.primary_color || '#3b82f6',
      '--primary-light': branding.primary_light || '#60a5fa',
      '--primary-dark': branding.primary_dark || '#2563eb',
      '--secondary-color': branding.secondary_color || '#6b7280',
      '--font-color': branding.font_color || '#374151',
      '--background-color': branding.background_color || '#ffffff',
      '--border-color': branding.border_color || 'rgba(59, 130, 246, 0.1)',
      
      /* === CHAT BUBBLE COLORS === */
      '--user-bubble-color': branding.user_bubble_color || '#3b82f6',
      '--user-bubble-text-color': branding.user_bubble_text_color || '#ffffff',
      '--user-bubble-margin': branding.user_bubble_margin || '20px',
      '--bot-bubble-color': branding.bot_bubble_color || '#f8fafc',
      '--bot-bubble-text-color': branding.bot_bubble_text_color || '#374151',
      '--bot-bubble-border': branding.bot_bubble_border || '1px solid rgba(59, 130, 246, 0.1)',
      '--bot-bubble-margin': branding.bot_bubble_margin || '20px',
      
      /* === INTERFACE COLORS === */
      '--header-background-color': branding.header_background_color || branding.title_bar_color || '#3b82f6',
      '--header-text-color': branding.header_text_color || determineHeaderTextColor(branding),
      '--header-close-color': branding.header_close_color || branding.header_text_color || determineHeaderTextColor(branding),
      '--widget-icon-color': branding.widget_icon_color || determineContrastColor(branding.widget_background_color || branding.primary_color),
      '--widget-background-color': branding.widget_background_color || branding.primary_color || '#3b82f6',
      '--link-color': branding.link_color || branding.markdown_link_color || '#3b82f6',
      '--link-hover-color': branding.link_hover_color || darkenColor(branding.link_color || '#3b82f6', 15),
      
      /* === INPUT FIELD STYLING === */
      '--input-background-color': branding.input_background_color || '#ffffff',
      '--input-border-color': branding.input_border_color || 'rgba(59, 130, 246, 0.08)',
      '--input-border-width': branding.input_border_width || '2px',
      '--input-focus-color': branding.input_focus_color || branding.primary_color || '#3b82f6',
      '--input-focus-bg': branding.input_focus_bg || '#ffffff',
      '--input-placeholder-color': branding.input_placeholder_color || '#94a3b8',
      '--input-font-size': ensurePixelUnit(branding.input_font_size || branding.font_size || '14px'),
      '--input-padding': branding.input_padding || '10px 14px 6px 14px',
      '--input-border-radius': ensurePixelUnit(branding.input_border_radius || branding.border_radius || '12px'),
      
      /* === STATUS COLORS === */
      '--error-color': branding.error_color || '#ef4444',
      '--success-color': branding.success_color || '#10b981',
      '--warning-color': branding.warning_color || '#f59e0b',
      
      /* === TYPOGRAPHY === */
      '--font-family': branding.font_family || 'system-ui, -apple-system, sans-serif',
      '--font-size-base': ensurePixelUnit(branding.font_size_base || branding.font_size || '14px'),
      '--font-size-small': ensurePixelUnit(branding.font_size_small || '12px'),
      '--font-size-large': ensurePixelUnit(branding.font_size_large || '16px'),
      '--font-size-heading': ensurePixelUnit(branding.font_size_heading || branding.title_font_size || '16px'),
      '--font-weight-normal': branding.font_weight_normal || branding.font_weight || '400',
      '--font-weight-medium': branding.font_weight_medium || '500',
      '--font-weight-semibold': branding.font_weight_semibold || '600',
      '--font-weight-bold': branding.font_weight_bold || '700',
      '--font-weight-heading': branding.font_weight_heading || '600',
      '--line-height-base': branding.line_height || '1.5',
      '--line-height-heading': branding.line_height_heading || '1.2',
      
      /* === LAYOUT & SPACING === */
      '--border-radius': ensurePixelUnit(branding.border_radius || '12px'),
      '--border-radius-small': ensurePixelUnit(branding.border_radius_small || calculateSmallRadius(branding.border_radius)),
      '--border-radius-large': ensurePixelUnit(branding.border_radius_large || calculateLargeRadius(branding.border_radius)),
      '--border-width': ensurePixelUnit(branding.border_height || branding.border_width || '1px'),
      '--border-width-thick': ensurePixelUnit(branding.border_width_thick || '2px'),
      
      /* === SPACING SYSTEM === */
      '--message-spacing': branding.message_spacing || '16px',
      '--bubble-padding': branding.bubble_padding || '12px 16px',
      '--container-padding': branding.container_padding || '16px',
      '--action-chip-margin': branding.action_chip_margin || '16px',
      '--action-chip-gap': branding.action_chip_gap || '8px',
      '--action-chip-container-padding': branding.action_chip_container_padding || '4px 0',
      
      /* === CHAT WIDGET DIMENSIONS === */
      '--chat-width': ensurePixelUnit(branding.chat_width || '360px'),
      '--chat-height': ensurePixelUnit(branding.chat_height || '540px'),
      '--chat-max-height': branding.chat_max_height || '80vh',
      '--chat-width-large': ensurePixelUnit(branding.chat_width_large || '400px'),
      '--chat-height-large': ensurePixelUnit(branding.chat_height_large || '600px'),
      '--chat-width-mobile': branding.chat_width_mobile || 'calc(100vw - 24px)',
      '--chat-height-mobile': branding.chat_height_mobile || 'calc(100vh - 80px)',
      '--chat-width-tablet': branding.chat_width_tablet || 'calc(100vw - 32px)',
      '--chat-height-tablet': branding.chat_height_tablet || 'calc(100vh - 100px)',
      
      /* === WIDGET POSITIONING === */
      '--widget-bottom': calculateWidgetPosition(branding.chat_position, 'bottom'),
      '--widget-right': calculateWidgetPosition(branding.chat_position, 'right'),
      '--widget-top': calculateWidgetPosition(branding.chat_position, 'top'),
      '--widget-left': calculateWidgetPosition(branding.chat_position, 'left'),
      '--widget-z-index': branding.widget_z_index || '1000',
      '--chat-transform-origin': calculateTransformOrigin(branding.chat_position),
      
      /* === AVATAR SYSTEM === */
      '--avatar-url': generateAvatarUrl(config),
      '--avatar-border-radius': determineAvatarBorderRadius(branding.avatar_shape),
      '--avatar-display': branding.avatar_shape === 'hidden' ? 'none' : 'block',
      '--avatar-border': branding.avatar_border || '2px solid rgba(59, 130, 246, 0.15)',
      '--avatar-shadow': branding.avatar_shadow || '0 2px 8px rgba(59, 130, 246, 0.1), 0 1px 3px rgba(0, 0, 0, 0.05)',
      
      /* === ACTION CHIP SYSTEM (Complete & Optimized) === */
      '--action-chip-bg': branding.action_chip_bg || 'rgba(59, 130, 246, 0.08)',
      '--action-chip-border': branding.action_chip_border || '2px solid rgba(59, 130, 246, 0.2)',
      '--action-chip-color': branding.action_chip_color || branding.primary_color || '#3b82f6',
      '--action-chip-hover-bg': branding.action_chip_hover_bg || branding.primary_color || '#3b82f6',
      '--action-chip-hover-color': branding.action_chip_hover_color || '#ffffff',
      '--action-chip-hover-border': branding.action_chip_hover_border || branding.primary_color || '#3b82f6',
      '--action-chip-disabled-bg': branding.action_chip_disabled_bg || '#f9fafb',
      '--action-chip-disabled-color': branding.action_chip_disabled_color || '#9ca3af',
      '--action-chip-disabled-border': branding.action_chip_disabled_border || '#e5e7eb',
      '--action-chip-padding': branding.action_chip_padding || '12px 16px',
      '--action-chip-radius': ensurePixelUnit(branding.action_chip_radius || '8px'),
      '--action-chip-font-size': ensurePixelUnit(branding.action_chip_font_size || '13px'),
      '--action-chip-font-weight': branding.action_chip_font_weight || '500',
      '--action-chip-shadow': branding.action_chip_shadow || '0 1px 3px rgba(0, 0, 0, 0.1)',
      '--action-chip-hover-shadow': generateActionChipShadow(branding.primary_color),
      
      /* === ENHANCED SHADOW SYSTEM === */
      '--bubble-shadow': branding.bubble_shadow || '0 1px 3px rgba(0, 0, 0, 0.1)',
      '--bubble-shadow-hover': branding.bubble_shadow_hover || '0 2px 8px rgba(0, 0, 0, 0.15)',
      '--primary-shadow': branding.primary_shadow || '0 4px 12px rgba(59, 130, 246, 0.25)',
      '--primary-shadow-light': branding.primary_shadow_light || '0 2px 8px rgba(59, 130, 246, 0.15)',
      '--primary-shadow-hover': branding.primary_shadow_hover || '0 6px 16px rgba(59, 130, 246, 0.3)',
      '--container-shadow': branding.container_shadow || '0 10px 25px rgba(0, 0, 0, 0.1)',
      '--header-shadow': branding.header_shadow || '0 2px 8px rgba(59, 130, 246, 0.15)',
      '--input-shadow': branding.input_shadow || '0 2px 8px rgba(59, 130, 246, 0.08)',
      '--input-focus-shadow': branding.input_focus_shadow || '0 0 0 3px rgba(59, 130, 246, 0.1), 0 4px 12px rgba(59, 130, 246, 0.15)',
      '--send-button-shadow': branding.send_button_shadow || '0 2px 8px rgba(59, 130, 246, 0.25)',
      '--shadow-light': branding.shadow_light || '0 1px 3px rgba(0, 0, 0, 0.08)',
      '--shadow-medium': branding.shadow_medium || '0 4px 12px rgba(0, 0, 0, 0.1)',
      '--shadow-heavy': branding.shadow_heavy || '0 20px 25px rgba(0, 0, 0, 0.1)',
      
      /* === GRADIENTS === */
      '--user-bubble-gradient': generateUserBubbleGradient(branding.user_bubble_color || branding.primary_color),
      '--header-gradient': generateHeaderGradient(branding.header_background_color || branding.primary_color),
      '--primary-gradient': generatePrimaryGradient(branding.primary_color),
      '--widget-gradient': generateWidgetGradient(branding.widget_background_color || branding.primary_color),
      
      /* === CLOSE BUTTON COLORS === */
      '--close-button-hover-bg': generateCloseButtonHoverBg(branding),
      '--close-button-hover-color': generateCloseButtonHoverColor(branding),
      '--title-text-shadow': branding.enable_white_title ? '0 1px 3px rgba(0, 0, 0, 0.3)' : 'none',
      
      /* === COMPUTED COLORS === */
      '--button-hover-color': darkenColor(branding.primary_color || '#3b82f6', 10),
      '--primary-light-computed': lightenColor(branding.primary_color || '#3b82f6', 90),
      
      /* === ANIMATION & TRANSITIONS === */
      '--transition-fast': branding.transition_fast || '0.15s ease',
      '--transition-normal': branding.transition_normal || '0.2s ease',
      '--transition-slow': branding.transition_slow || '0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      '--typing-animation-duration': features.streaming ? '0.8s' : '1.4s',
      
      /* === FEATURE-BASED STYLING === */
      '--upload-button-display': (features.uploads || features.photo_uploads) ? 'flex' : 'none',
      '--photo-upload-display': features.photo_uploads !== false ? 'flex' : 'none',
      '--photo-button-display': features.photo_uploads !== false ? 'flex' : 'none',
      '--voice-display': features.voice_input ? 'flex' : 'none',
      '--voice-button-display': features.voice_input ? 'flex' : 'none',
      '--quick-help-container-display': quickHelpEnabled ? 'block' : 'none',
      '--action-chips-display': actionChipsEnabled ? 'flex' : 'none',
      '--callout-display': calloutEnabled ? 'block' : 'none',
      '--callout-enabled': calloutEnabled ? '1' : '0',
      '--notification-display': 'flex',
      
      /* === QUICK HELP STYLING === */
      '--quick-help-bg': branding.quick_help_bg || '#fafbfc',
      '--quick-help-border': branding.quick_help_border || '#f0f0f0',
      '--quick-help-shadow': branding.quick_help_shadow || '0 -4px 20px rgba(0, 0, 0, 0.1)',
      '--quick-help-overlay-bg': branding.quick_help_overlay_bg || '#ffffff',
      '--quick-help-overlay-border': branding.quick_help_overlay_border || '#e5e7eb',
      '--quick-help-overlay-shadow': branding.quick_help_overlay_shadow || '0 -4px 12px rgba(0, 0, 0, 0.1)',
      '--quick-help-button-shadow': branding.quick_help_button_shadow || '0 2px 4px rgba(0, 0, 0, 0.08)',
      
      /* === CALLOUT STYLING === */
      '--callout-shadow': branding.callout_shadow || '0 8px 24px rgba(0, 0, 0, 0.15)',
      '--callout-hover-shadow': branding.callout_hover_shadow || '0 12px 32px rgba(0, 0, 0, 0.2)',
      '--callout-animation-duration': branding.callout_animation_duration || '0.3s',
      '--notification-animation-duration': branding.notification_animation_duration || '2s',
      
      /* === FOCUS STATES === */
      '--focus-ring': generateFocusRing(branding.input_focus_color || branding.primary_color),
      '--input-focus-ring-color': generateInputFocusRing(branding.input_focus_color || branding.primary_color),
      '--input-divider-color': branding.input_divider_color || 'transparent',
      '--input-divider-focus-color': generateInputDividerFocusColor(branding.primary_color),
      
      /* === RESPONSIVE BREAKPOINTS === */
      '--mobile-breakpoint': branding.mobile_breakpoint || '480px',
      '--tablet-breakpoint': branding.tablet_breakpoint || '768px',
      '--desktop-breakpoint': branding.desktop_breakpoint || '1024px',
      
      /* === UPLOAD STATES === */
      '--upload-success-border': branding.upload_success_border || '#10b981',
      '--upload-success-bg': branding.upload_success_bg || 'rgba(16, 185, 129, 0.1)',
      '--upload-error-border': branding.upload_error_border || '#ef4444',
      '--upload-error-bg': branding.upload_error_bg || 'rgba(239, 68, 68, 0.1)',
      '--upload-warning-border': branding.upload_warning_border || '#f59e0b',
      '--upload-warning-bg': branding.upload_warning_bg || 'rgba(245, 158, 11, 0.1)',
    };

    // Apply CSS variables with comprehensive logging
    const appliedVariables = [];
    const failedVariables = [];
    
    Object.entries(cssVariables).forEach(([property, value]) => {
      if (value && typeof value === 'string' && value !== 'undefined') {
        try {
          root.style.setProperty(property, value);
          appliedVariables.push(property);
          console.log(`  ✅ ${property}: ${value}`);
        } catch (error) {
          console.warn(`  ⚠️ Failed to set ${property}:`, error);
          failedVariables.push({ property, value, error: error.message });
        }
      } else {
        console.log(`  ⏭️ Skipping ${property}: invalid value (${value})`);
      }
    });

    // Apply feature-based styles with new config structure
    applyEnhancedFeatureStyles(features, root, config, quickHelpEnabled, actionChipsEnabled, calloutEnabled);
    
    // Apply chat positioning
    applyChatPositioning(branding.chat_position, root);
    
    // Apply advanced computed styles
    applyComputedStyles(cssVariables, root);

    console.log(`🎨 Applied ${appliedVariables.length} CSS variables`);
    console.log(`🎯 Key configuration applied:`, {
      primaryColor: cssVariables['--primary-color'],
      spacing: cssVariables['--message-spacing'],
      radius: cssVariables['--border-radius'],
      gradients: 'enabled',
      avatars: 'enhanced system',
      dimensions: `${cssVariables['--chat-width']} × ${cssVariables['--chat-height']}`
    });
    
    if (failedVariables.length > 0) {
      console.warn(`⚠️ ${failedVariables.length} variables failed:`, failedVariables);
    }

    // Store current config for debugging
    window.currentPicassoConfig = config;
    window.appliedCSSVariables = cssVariables;
    window.picassoDebug = {
      config,
      appliedVariables: cssVariables,
      tenant_id: config?.tenant_id,
      enhancementsApplied: true,
      logoSystem: 'Enhanced',
      configStructure: 'Updated for Action Chips & Quick Help'
    };

    // Cleanup function
    return () => {
      console.log('🧹 Cleaning up CSS variables...');
      appliedVariables.forEach(property => {
        root.style.removeProperty(property);
      });
    };
  }, [config]);
}

/* === HELPER FUNCTIONS === */

function ensurePixelUnit(value) {
  if (!value) return value;
  if (typeof value === 'number') return `${value}px`;
  if (typeof value === 'string') {
    if (/^\d+$/.test(value.trim())) return `${value}px`;
    return value;
  }
  return value;
}

function calculateSmallRadius(mainRadius) {
  if (!mainRadius) return '8px';
  const numValue = parseInt(mainRadius);
  return `${Math.max(4, Math.round(numValue * 0.67))}px`;
}

function calculateLargeRadius(mainRadius) {
  if (!mainRadius) return '16px';
  const numValue = parseInt(mainRadius);
  return `${Math.round(numValue * 1.33)}px`;
}

function calculateWidgetPosition(chatPosition, dimension) {
  const position = (chatPosition || 'Bottom Right').toLowerCase();
  
  const positions = {
    'bottom right': { bottom: '24px', right: '24px', top: 'auto', left: 'auto' },
    'bottom left': { bottom: '24px', left: '24px', top: 'auto', right: 'auto' },
    'top right': { top: '24px', right: '24px', bottom: 'auto', left: 'auto' },
    'top left': { top: '24px', left: '24px', bottom: 'auto', right: 'auto' }
  };
  
  const pos = positions[position] || positions['bottom right'];
  return pos[dimension] || 'auto';
}

function calculateTransformOrigin(chatPosition) {
  const position = (chatPosition || 'Bottom Right').toLowerCase();
  const transformOrigins = {
    'bottom-right': 'bottom right',
    'bottom-left': 'bottom left', 
    'top-right': 'top right',
    'top-left': 'top left'
  };
  return transformOrigins[position.replace(' ', '-')] || 'bottom right';
}

/* === AVATAR SYSTEM === */

function generateAvatarUrl(config) {
  const { tenant_id, branding, _cloudfront } = config || {};
  
  console.log('🖼️ Generating avatar URL for:', tenant_id);
  console.log('📊 Available sources:', {
    avatar_url: branding?.avatar_url,
    logo_url: branding?.logo_url,
    bot_avatar_url: branding?.bot_avatar_url,
    icon: branding?.icon,
    cloudfront_domain: _cloudfront?.domain || config?.cloudfront_domain
  });
  
  // Priority order for avatar sources
  const avatarSources = [
    // Direct URLs from config (highest priority)
    branding?.avatar_url,
    branding?.logo_url,
    branding?.bot_avatar_url,           
    branding?.icon,                     
    branding?.custom_icons?.bot_avatar,
    
    // CloudFront generated URLs
    _cloudfront?.urls?.avatar,
    _cloudfront?.urls?.logo,
    
    // Generic CloudFront paths (no tenant-specific preferences)
    `https://chat.myrecruiter.ai/tenants/${tenant_id}/avatar.png`,
    `https://chat.myrecruiter.ai/tenants/${tenant_id}/logo.png`,
    `https://chat.myrecruiter.ai/tenants/${tenant_id}/avatar.svg`,
    `https://chat.myrecruiter.ai/tenants/${tenant_id}/logo.svg`,
    
    // Generic fallback
    'https://chat.myrecruiter.ai/tenants/default-avatar.png',
    '/default-avatar.png'
  ];
  
  const finalUrl = avatarSources.find(url => url && url.trim() && url !== 'undefined') || '/default-avatar.png';
  
  console.log('✅ Selected avatar URL:', finalUrl);
  
  return `url(${finalUrl})`;
}

function determineAvatarBorderRadius(avatarShape) {
  const shape = (avatarShape || 'circle').toLowerCase();
  const shapeStyles = {
    'circle': '50%',
    'rounded': '8px', 
    'square': '0px',
    'hidden': '50%'
  };
  return shapeStyles[shape] || '50%';
}

function generateUserBubbleGradient(color) {
  if (!color) return 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)';
  const darkened = darkenColor(color, 10);
  return `linear-gradient(135deg, ${color} 0%, ${darkened} 100%)`;
}

function generateHeaderGradient(color) {
  if (!color) return 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)';
  const darkened = darkenColor(color, 8);
  return `linear-gradient(135deg, ${color} 0%, ${darkened} 100%)`;
}

function generatePrimaryGradient(color) {
  if (!color) return 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)';
  const darkened = darkenColor(color, 12);
  return `linear-gradient(135deg, ${color} 0%, ${darkened} 100%)`;
}

function generateWidgetGradient(color) {
  if (!color) return 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)';
  const darkened = darkenColor(color, 6);
  return `linear-gradient(135deg, ${color} 0%, ${darkened} 100%)`;
}

function generateActionChipShadow(primaryColor) {
  const rgb = hexToRgb(primaryColor || '#3b82f6');
  if (!rgb) return '0 4px 12px rgba(59, 130, 246, 0.25), 0 1px 3px rgba(59, 130, 246, 0.1)';
  return `0 4px 12px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25), 0 1px 3px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`;
}

function generateCloseButtonHoverBg(branding) {
  const headerBg = branding.header_background_color || branding.title_bar_color || '#3b82f6';
  return isLightColor(headerBg) ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.25)';
}

function generateCloseButtonHoverColor(branding) {
  const headerBg = branding.header_background_color || branding.title_bar_color || '#3b82f6';
  return isLightColor(headerBg) ? '#374151' : '#ffffff';
}

function determineHeaderTextColor(branding) {
  // 1. Use explicit header_text_color if provided
  if (branding.header_text_color) {
    return branding.header_text_color;
  }
  // 2. Otherwise, fall back to brightness calculation or forceWhite flag
  const headerBg = branding.header_background_color || branding.title_bar_color || '#3b82f6';
  const forceWhite = branding.enable_white_title || branding.white_title;
  if (forceWhite) {
    return '#ffffff';
  }
  return isLightColor(headerBg) ? '#1f2937' : '#ffffff';
}

function determineContrastColor(backgroundColor) {
   return isLightColor(backgroundColor) ? '#1f2937' : '#ffffff';
}

function generateFocusRing(color) {
  const rgb = hexToRgb(color || '#3b82f6');
  if (!rgb) return '0 0 0 3px rgba(59, 130, 246, 0.2)';
  return `0 0 0 3px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`;
}

function generateInputFocusRing(color) {
  const rgb = hexToRgb(color || '#3b82f6');
  if (!rgb) return 'rgba(59, 130, 246, 0.1)';
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`;
}

function generateInputDividerFocusColor(color) {
  const rgb = hexToRgb(color || '#3b82f6');
  if (!rgb) return 'rgba(59, 130, 246, 0.1)';
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`;
}

// Enhanced feature styles with new config structure
function applyEnhancedFeatureStyles(features, root, config, quickHelpEnabled, actionChipsEnabled, calloutEnabled) {
  console.log('🎛️ Applying enhanced feature styles');
  
  // Feature classes for additional styling
  const featureClasses = [];
  if (!features.uploads) featureClasses.push('feature-uploads-disabled');
  if (!features.voice_input) featureClasses.push('feature-voice-disabled');
  if (!quickHelpEnabled) featureClasses.push('feature-quick-help-disabled');
  if (!actionChipsEnabled) featureClasses.push('feature-action-chips-disabled');
  if (!calloutEnabled) featureClasses.push('feature-callout-disabled');
  
  // Remove existing feature classes
  document.body.classList.remove(
    'feature-uploads-disabled',
    'feature-voice-disabled', 
    'feature-quick-help-disabled',
    'feature-action-chips-disabled',
    'feature-callout-disabled'
  );
  
  // Add current feature classes
  if (featureClasses.length > 0) {
    document.body.classList.add(...featureClasses);
  }
  
  console.log('✅ Enhanced feature styles applied:', {
    quickHelpEnabled,
    actionChipsEnabled,
    calloutEnabled,
    appliedClasses: featureClasses
  });
}

function applyChatPositioning(chatPosition, root) {
  const position = (chatPosition || 'Bottom Right').toLowerCase();
  const positionClass = position.replace(' ', '-');
  root.style.setProperty('--chat-position-class', positionClass);
  
  const transformOrigins = {
    'bottom-right': 'bottom right',
    'bottom-left': 'bottom left', 
    'top-right': 'top right',
    'top-left': 'top left'
  };
  
  root.style.setProperty('--chat-transform-origin', transformOrigins[positionClass] || 'bottom right');
  console.log(`  ✅ Chat position: ${position}`);
}

function applyComputedStyles(variables, root) {
  console.log('🧮 Computing advanced styles...');
  
  const primaryColor = variables['--primary-color'];
  if (primaryColor && primaryColor.startsWith('#')) {
    try {
      const rgb = hexToRgb(primaryColor);
      if (rgb) {
        root.style.setProperty('--primary-shadow-computed', `0 4px 12px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25)`);
        root.style.setProperty('--primary-shadow-hover-computed', `0 8px 20px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35)`);
        root.style.setProperty('--primary-shadow-light-computed', `0 2px 8px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`);
      }
    } catch (e) {
      console.warn('Shadow computation failed:', e);
    }
  }
  
  // Compute focus ring colors
  const focusColor = variables['--input-focus-color'];
  if (focusColor) {
    const rgb = hexToRgb(focusColor);
    if (rgb) {
      root.style.setProperty('--focus-ring-computed', `0 0 0 3px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`);
    }
  }
  
  console.log('✅ Advanced styles computed');
}

function isLightColor(color) {
  if (!color || typeof color !== 'string') return true;
  const hex = color.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128;
}

function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return null;
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function darkenColor(color, percent) {
  if (!color || !color.startsWith('#')) return color;
  
  try {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, (num >> 16) - amt);
    const G = Math.max(0, (num >> 8 & 0x00FF) - amt);
    const B = Math.max(0, (num & 0x0000FF) - amt);
    
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B)
      .toString(16)
      .slice(1);
  } catch (e) {
    console.warn('Color darkening failed:', e);
    return color;
  }
}

function lightenColor(color, percent) {
  if (!color || !color.startsWith('#')) return color;
  
  try {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, (num >> 16) + amt);
    const G = Math.min(255, (num >> 8 & 0x00FF) + amt);
    const B = Math.min(255, (num & 0x0000FF) + amt);
    
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B)
      .toString(16)
      .slice(1);
  } catch (e) {
    console.warn('Color lightening failed:', e);
    return color;
  }
}

// Component wrapper to inject CSS variables
export function CSSVariablesProvider({ children }) {
  const { config } = useConfig();
  
  useCSSVariables(config);
  
  useEffect(() => {
    window.configProvider = { config };
    window.currentTenantConfig = config;
    window.picassoDebug = {
      config,
      appliedVariables: window.appliedCSSVariables,
      tenant_id: config?.tenant_id,
      enhancementsApplied: true,
      logoSystem: 'Enhanced',
      configStructure: 'Updated for Action Chips & Quick Help'
    };
    console.log('🎨 CSS variables provider ready');
  }, [config]);

  return children;
}

// Development and testing helpers
if (typeof window !== 'undefined') {
  // Global function to test CSS variable updates
  window.testCSS = (property, value) => {
    console.log(`🧪 Testing CSS update: ${property} = ${value}`);
    document.documentElement.style.setProperty(property, value);
  };
  
  // Test themes
  window.applyTheme = (theme = 'default') => {
    const themes = {
      default: { 
        '--primary-color': '#3b82f6', 
        '--message-spacing': '16px',
        '--border-radius': '12px',
        '--bubble-padding': '12px 16px',
        '--chat-width': '360px',
        '--chat-height': '540px',
        '--action-chips-display': 'flex',
        '--quick-help-container-display': 'block'
      },
      compact: { 
        '--primary-color': '#6b7280', 
        '--message-spacing': '12px',
        '--border-radius': '8px',
        '--bubble-padding': '8px 12px',
        '--chat-width': '320px',
        '--chat-height': '480px',
        '--action-chips-display': 'flex',
        '--quick-help-container-display': 'block'
      },
      spacious: { 
        '--primary-color': '#059669', 
        '--message-spacing': '20px',
        '--border-radius': '16px',
        '--bubble-padding': '16px 20px',
        '--chat-width': '400px',
        '--chat-height': '600px',
        '--action-chips-display': 'flex',
        '--quick-help-container-display': 'block'
      }
    };
    
    const selectedTheme = themes[theme] || themes.default;
    Object.entries(selectedTheme).forEach(([prop, val]) => {
      document.documentElement.style.setProperty(prop, val);
    });
    
    console.log(`🎨 Applied ${theme} theme:`, selectedTheme);
  };
  
  // Export function
  window.exportConfig = () => {
    const config = window.currentTenantConfig;
    const variables = window.appliedCSSVariables;
    
    console.log('📊 Current Configuration:', {
      config,
      variables,
      tenant_id: config?.tenant_id,
      primary_color: config?.branding?.primary_color,
      quick_help_enabled: config?.quick_help?.enabled,
      action_chips_enabled: config?.action_chips?.enabled,
      enhancements_applied: true,
      logo_system: 'Enhanced',
      architecture: 'Separated Action Chips & Quick Help'
    });
    
    return { config, variables };
  };

  // Test functions for new config structure
  window.testQuickHelpToggle = () => {
    const currentDisplay = document.documentElement.style.getPropertyValue('--quick-help-container-display');
    const newDisplay = currentDisplay === 'none' ? 'block' : 'none';
    document.documentElement.style.setProperty('--quick-help-container-display', newDisplay);
    console.log(`🧪 Quick Help toggled: ${newDisplay}`);
  };

  window.testActionChipsToggle = () => {
    const currentDisplay = document.documentElement.style.getPropertyValue('--action-chips-display');
    const newDisplay = currentDisplay === 'none' ? 'flex' : 'none';
    document.documentElement.style.setProperty('--action-chips-display', newDisplay);
    console.log(`🧪 Action Chips toggled: ${newDisplay}`);
  };

  // Avatar testing functions
  window.testAvatarUrl = async (url) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        console.log('✅ Avatar URL works:', url);
        resolve(true);
      };
      img.onerror = () => {
        console.log('❌ Avatar URL failed:', url);
        resolve(false);
      };
      img.src = url;
    });
  };

  window.debugAvatar = async (config) => {
    console.log('🔍 Avatar Debug:');
    const currentConfig = config || window.currentTenantConfig;
    
    if (!currentConfig) {
      console.log('❌ No config available for avatar testing');
      return;
    }

    const { tenant_id, branding } = currentConfig;
    
    const candidateUrls = [
      branding?.avatar_url,
      branding?.logo_url,
      `https://chat.myrecruiter.ai/tenants/${tenant_id}/avatar.png`,
      `https://chat.myrecruiter.ai/tenants/${tenant_id}/logo.png`,
      '/default-avatar.png'
    ].filter(url => url && url.trim());
    
    console.log('🧪 Testing avatar URLs:');
    
    for (const url of candidateUrls) {
      const works = await window.testAvatarUrl(url);
      if (works) {
        console.log('🎯 First working URL found:', url);
        document.documentElement.style.setProperty('--avatar-url', `url(${url})`);
        return `url(${url})`;
      }
    }
    
    console.log('⚠️ No working avatar URLs found, using default');
    document.documentElement.style.setProperty('--avatar-url', 'url(/default-avatar.png)');
    return 'url(/default-avatar.png)';
  };

  window.applyTestLogo = (url) => {
    console.log('🧪 Applying test logo:', url);
    document.documentElement.style.setProperty('--avatar-url', `url(${url})`);
    
    const img = new Image();
    img.onload = () => console.log('✅ Test logo applied successfully');
    img.onerror = () => console.log('❌ Test logo failed to load');
    img.src = url;
  };

  console.log(`
🛠️  PICASSO DEVELOPMENT COMMANDS:
   debugAvatar()                  - Test all avatar URLs
   applyTestLogo('url')          - Test any custom URL
   testCSS(prop, value)          - Test CSS variables
   applyTheme('default')         - Apply theme variants
   exportConfig()                - Export current config
   
   FEATURE COMMANDS:
   testQuickHelpToggle()         - Toggle quick help display
   testActionChipsToggle()       - Toggle action chips display
  `);
  
  // Prevent tree-shaking of utility functions
  window.picassoUtilities = { isLightColor, determineContrastColor, determineHeaderTextColor };
}// src/hooks/useCSSVariables.js - Platform-Neutral Multi-Tenant CSS System
import { useEffect } from 'react';
import { useConfig } from '../../context/ConfigProvider';

export function useCSSVariables(config) {
  useEffect(() => {
    if (!config) {
      console.log('⏳ Waiting for config to load...');
      return;
    }

    console.log('🎨 Injecting CSS variables for tenant:', config.tenant_id);
    console.log('📊 Config structure:', {
      hasBranding: !!config.branding,
      hasFeatures: !!config.features,
      primaryColor: config.branding?.primary_color || config.primary_color || 'using-default',
      tenantId: config.tenant_id
    });

    const root = document.documentElement;
    const branding = config.branding || config;
    const features = config.features || {};

    // Clean feature detection with new config structure
    const quickHelpEnabled = config?.quick_help?.enabled !== false;
    const actionChipsEnabled = config?.action_chips?.enabled !== false;
    const calloutEnabled = features.callout !== false;

    // Complete CSS Variables Mapping - Platform Neutral Defaults
    const cssVariables = {
      
      /* === CORE COLORS === */
      '--primary-color': branding.primary_color || '#3b82f6',
      '--primary-light': branding.primary_light || '#60a5fa',
      '--primary-dark': branding.primary_dark || '#2563eb',
      '--secondary-color': branding.secondary_color || '#6b7280',
      '--font-color': branding.font_color || '#374151',
      '--background-color': branding.background_color || '#ffffff',
      '--border-color': branding.border_color || 'rgba(59, 130, 246, 0.1)',
      
      /* === CHAT BUBBLE COLORS === */
      '--user-bubble-color': branding.user_bubble_color || '#3b82f6',
      '--user-bubble-text-color': branding.user_bubble_text_color || '#ffffff',
      '--user-bubble-margin': branding.user_bubble_margin || '20px',
      '--bot-bubble-color': branding.bot_bubble_color || '#f8fafc',
      '--bot-bubble-text-color': branding.bot_bubble_text_color || '#374151',
      '--bot-bubble-border': branding.bot_bubble_border || '1px solid rgba(59, 130, 246, 0.1)',
      '--bot-bubble-margin': branding.bot_bubble_margin || '20px',
      
      /* === INTERFACE COLORS === */
      '--header-background-color': branding.header_background_color || branding.title_bar_color || '#3b82f6',
      '--header-text-color': branding.header_text_color || determineHeaderTextColor(branding),
      '--header-close-color': branding.header_close_color || branding.header_text_color || determineHeaderTextColor(branding),
      '--widget-icon-color': branding.widget_icon_color || determineContrastColor(branding.widget_background_color || branding.primary_color),
      '--widget-background-color': branding.widget_background_color || branding.primary_color || '#3b82f6',
      '--link-color': branding.link_color || branding.markdown_link_color || '#3b82f6',
      '--link-hover-color': branding.link_hover_color || darkenColor(branding.link_color || '#3b82f6', 15),
      
      /* === INPUT FIELD STYLING === */
      '--input-background-color': branding.input_background_color || '#ffffff',
      '--input-border-color': branding.input_border_color || 'rgba(59, 130, 246, 0.08)',
      '--input-border-width': branding.input_border_width || '2px',
      '--input-focus-color': branding.input_focus_color || branding.primary_color || '#3b82f6',
      '--input-focus-bg': branding.input_focus_bg || '#ffffff',
      '--input-placeholder-color': branding.input_placeholder_color || '#94a3b8',
      '--input-font-size': ensurePixelUnit(branding.input_font_size || branding.font_size || '14px'),
      '--input-padding': branding.input_padding || '10px 14px 6px 14px',
      '--input-border-radius': ensurePixelUnit(branding.input_border_radius || branding.border_radius || '12px'),
      
      /* === STATUS COLORS === */
      '--error-color': branding.error_color || '#ef4444',
      '--success-color': branding.success_color || '#10b981',
      '--warning-color': branding.warning_color || '#f59e0b',
      
      /* === TYPOGRAPHY === */
      '--font-family': branding.font_family || 'system-ui, -apple-system, sans-serif',
      '--font-size-base': ensurePixelUnit(branding.font_size_base || branding.font_size || '14px'),
      '--font-size-small': ensurePixelUnit(branding.font_size_small || '12px'),
      '--font-size-large': ensurePixelUnit(branding.font_size_large || '16px'),
      '--font-size-heading': ensurePixelUnit(branding.font_size_heading || branding.title_font_size || '16px'),
      '--font-weight-normal': branding.font_weight_normal || branding.font_weight || '400',
      '--font-weight-medium': branding.font_weight_medium || '500',
      '--font-weight-semibold': branding.font_weight_semibold || '600',
      '--font-weight-bold': branding.font_weight_bold || '700',
      '--font-weight-heading': branding.font_weight_heading || '600',
      '--line-height-base': branding.line_height || '1.5',
      '--line-height-heading': branding.line_height_heading || '1.2',
      
      /* === LAYOUT & SPACING === */
      '--border-radius': ensurePixelUnit(branding.border_radius || '12px'),
      '--border-radius-small': ensurePixelUnit(branding.border_radius_small || calculateSmallRadius(branding.border_radius)),
      '--border-radius-large': ensurePixelUnit(branding.border_radius_large || calculateLargeRadius(branding.border_radius)),
      '--border-width': ensurePixelUnit(branding.border_height || branding.border_width || '1px'),
      '--border-width-thick': ensurePixelUnit(branding.border_width_thick || '2px'),
      
      /* === SPACING SYSTEM === */
      '--message-spacing': branding.message_spacing || '16px',
      '--bubble-padding': branding.bubble_padding || '12px 16px',
      '--container-padding': branding.container_padding || '16px',
      '--action-chip-margin': branding.action_chip_margin || '16px',
      '--action-chip-gap': branding.action_chip_gap || '8px',
      '--action-chip-container-padding': branding.action_chip_container_padding || '4px 0',
      
      /* === CHAT WIDGET DIMENSIONS === */
      '--chat-width': ensurePixelUnit(branding.chat_width || '360px'),
      '--chat-height': ensurePixelUnit(branding.chat_height || '540px'),
      '--chat-max-height': branding.chat_max_height || '80vh',
      '--chat-width-large': ensurePixelUnit(branding.chat_width_large || '400px'),
      '--chat-height-large': ensurePixelUnit(branding.chat_height_large || '600px'),
      '--chat-width-mobile': branding.chat_width_mobile || 'calc(100vw - 24px)',
      '--chat-height-mobile': branding.chat_height_mobile || 'calc(100vh - 80px)',
      '--chat-width-tablet': branding.chat_width_tablet || 'calc(100vw - 32px)',
      '--chat-height-tablet': branding.chat_height_tablet || 'calc(100vh - 100px)',
      
      /* === WIDGET POSITIONING === */
      '--widget-bottom': calculateWidgetPosition(branding.chat_position, 'bottom'),
      '--widget-right': calculateWidgetPosition(branding.chat_position, 'right'),
      '--widget-top': calculateWidgetPosition(branding.chat_position, 'top'),
      '--widget-left': calculateWidgetPosition(branding.chat_position, 'left'),
      '--widget-z-index': branding.widget_z_index || '1000',
      '--chat-transform-origin': calculateTransformOrigin(branding.chat_position),
      
      /* === AVATAR SYSTEM === */
      '--avatar-url': generateAvatarUrl(config),
      '--avatar-border-radius': determineAvatarBorderRadius(branding.avatar_shape),
      '--avatar-display': branding.avatar_shape === 'hidden' ? 'none' : 'block',
      '--avatar-border': branding.avatar_border || '2px solid rgba(59, 130, 246, 0.15)',
      '--avatar-shadow': branding.avatar_shadow || '0 2px 8px rgba(59, 130, 246, 0.1), 0 1px 3px rgba(0, 0, 0, 0.05)',
      
      /* === ACTION CHIP SYSTEM === */
      '--action-chip-bg': branding.action_chip_bg || 'rgba(59, 130, 246, 0.08)',
      '--action-chip-border': branding.action_chip_border || '2px solid rgba(59, 130, 246, 0.2)',
      '--action-chip-color': branding.action_chip_color || branding.primary_color || '#3b82f6',
      '--action-chip-hover-bg': branding.action_chip_hover_bg || branding.primary_color || '#3b82f6',
      '--action-chip-hover-color': branding.action_chip_hover_color || '#ffffff',
      '--action-chip-hover-border': branding.action_chip_hover_border || branding.primary_color || '#3b82f6',
      '--action-chip-disabled-bg': branding.action_chip_disabled_bg || '#f9fafb',
      '--action-chip-disabled-color': branding.action_chip_disabled_color || '#9ca3af',
      '--action-chip-disabled-border': branding.action_chip_disabled_border || '#e5e7eb',
      '--action-chip-padding': branding.action_chip_padding || '12px 16px',
      '--action-chip-radius': ensurePixelUnit(branding.action_chip_radius || '8px'),
      '--action-chip-font-size': ensurePixelUnit(branding.action_chip_font_size || '13px'),
      '--action-chip-font-weight': branding.action_chip_font_weight || '500',
      '--action-chip-shadow': branding.action_chip_shadow || '0 1px 3px rgba(0, 0, 0, 0.1)',
      '--action-chip-hover-shadow': generateActionChipShadow(branding.primary_color),
      
      /* === SHADOW SYSTEM === */
      '--bubble-shadow': branding.bubble_shadow || '0 1px 3px rgba(0, 0, 0, 0.1)',
      '--bubble-shadow-hover': branding.bubble_shadow_hover || '0 2px 8px rgba(0, 0, 0, 0.15)',
      '--primary-shadow': branding.primary_shadow || '0 4px 12px rgba(59, 130, 246, 0.25)',
      '--primary-shadow-light': branding.primary_shadow_light || '0 2px 8px rgba(59, 130, 246, 0.15)',
      '--primary-shadow-hover': branding.primary_shadow_hover || '0 6px 16px rgba(59, 130, 246, 0.3)',
      '--container-shadow': branding.container_shadow || '0 10px 25px rgba(0, 0, 0, 0.1)',
      '--header-shadow': branding.header_shadow || '0 2px 8px rgba(59, 130, 246, 0.15)',
      '--input-shadow': branding.input_shadow || '0 2px 8px rgba(59, 130, 246, 0.08)',
      '--input-focus-shadow': branding.input_focus_shadow || '0 0 0 3px rgba(59, 130, 246, 0.1), 0 4px 12px rgba(59, 130, 246, 0.15)',
      '--send-button-shadow': branding.send_button_shadow || '0 2px 8px rgba(59, 130, 246, 0.25)',
      '--shadow-light': branding.shadow_light || '0 1px 3px rgba(0, 0, 0, 0.08)',
      '--shadow-medium': branding.shadow_medium || '0 4px 12px rgba(0, 0, 0, 0.1)',
      '--shadow-heavy': branding.shadow_heavy || '0 20px 25px rgba(0, 0, 0, 0.1)',
      
      /* === GRADIENTS === */
      '--user-bubble-gradient': generateUserBubbleGradient(branding.user_bubble_color || branding.primary_color),
      '--header-gradient': generateHeaderGradient(branding.header_background_color || branding.primary_color),
      '--primary-gradient': generatePrimaryGradient(branding.primary_color),
      '--widget-gradient': generateWidgetGradient(branding.widget_background_color || branding.primary_color),
      
      /* === CLOSE BUTTON COLORS === */
      '--close-button-hover-bg': generateCloseButtonHoverBg(branding),
      '--close-button-hover-color': generateCloseButtonHoverColor(branding),
      '--title-text-shadow': branding.enable_white_title ? '0 1px 3px rgba(0, 0, 0, 0.3)' : 'none',
      
      /* === COMPUTED COLORS === */
      '--button-hover-color': darkenColor(branding.primary_color || '#3b82f6', 10),
      '--primary-light-computed': lightenColor(branding.primary_color || '#3b82f6', 90),
      
      /* === ANIMATION & TRANSITIONS === */
      '--transition-fast': branding.transition_fast || '0.15s ease',
      '--transition-normal': branding.transition_normal || '0.2s ease',
      '--transition-slow': branding.transition_slow || '0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      '--typing-animation-duration': features.streaming ? '0.8s' : '1.4s',
      
      /* === FEATURE-BASED STYLING === */
      '--upload-button-display': (features.uploads || features.photo_uploads) ? 'flex' : 'none',
      '--photo-upload-display': features.photo_uploads !== false ? 'flex' : 'none',
      '--photo-button-display': features.photo_uploads !== false ? 'flex' : 'none',
      '--voice-display': features.voice_input ? 'flex' : 'none',
      '--voice-button-display': features.voice_input ? 'flex' : 'none',
      '--quick-help-container-display': quickHelpEnabled ? 'block' : 'none',
      '--action-chips-display': actionChipsEnabled ? 'flex' : 'none',
      '--callout-display': calloutEnabled ? 'block' : 'none',
      '--callout-enabled': calloutEnabled ? '1' : '0',
      '--notification-display': 'flex',
      
      /* === QUICK HELP STYLING === */
      '--quick-help-bg': branding.quick_help_bg || '#fafbfc',
      '--quick-help-border': branding.quick_help_border || '#f0f0f0',
      '--quick-help-shadow': branding.quick_help_shadow || '0 -4px 20px rgba(0, 0, 0, 0.1)',
      '--quick-help-overlay-bg': branding.quick_help_overlay_bg || '#ffffff',
      '--quick-help-overlay-border': branding.quick_help_overlay_border || '#e5e7eb',
      '--quick-help-overlay-shadow': branding.quick_help_overlay_shadow || '0 -4px 12px rgba(0, 0, 0, 0.1)',
      '--quick-help-button-shadow': branding.quick_help_button_shadow || '0 2px 4px rgba(0, 0, 0, 0.08)',
      
      /* === CALLOUT STYLING === */
      '--callout-shadow': branding.callout_shadow || '0 8px 24px rgba(0, 0, 0, 0.15)',
      '--callout-hover-shadow': branding.callout_hover_shadow || '0 12px 32px rgba(0, 0, 0, 0.2)',
      '--callout-animation-duration': branding.callout_animation_duration || '0.3s',
      '--notification-animation-duration': branding.notification_animation_duration || '2s',
      
      /* === FOCUS STATES === */
      '--focus-ring': generateFocusRing(branding.input_focus_color || branding.primary_color),
      '--input-focus-ring-color': generateInputFocusRing(branding.input_focus_color || branding.primary_color),
      '--input-divider-color': branding.input_divider_color || 'transparent',
      '--input-divider-focus-color': generateInputDividerFocusColor(branding.primary_color),
      
      /* === RESPONSIVE BREAKPOINTS === */
      '--mobile-breakpoint': branding.mobile_breakpoint || '480px',
      '--tablet-breakpoint': branding.tablet_breakpoint || '768px',
      '--desktop-breakpoint': branding.desktop_breakpoint || '1024px',
      
      /* === UPLOAD STATES === */
      '--upload-success-border': branding.upload_success_border || '#10b981',
      '--upload-success-bg': branding.upload_success_bg || 'rgba(16, 185, 129, 0.1)',
      '--upload-error-border': branding.upload_error_border || '#ef4444',
      '--upload-error-bg': branding.upload_error_bg || 'rgba(239, 68, 68, 0.1)',
      '--upload-warning-border': branding.upload_warning_border || '#f59e0b',
      '--upload-warning-bg': branding.upload_warning_bg || 'rgba(245, 158, 11, 0.1)',
    };

    // Apply CSS variables with comprehensive logging
    const appliedVariables = [];
    const failedVariables = [];
    
    Object.entries(cssVariables).forEach(([property, value]) => {
      if (value && typeof value === 'string' && value !== 'undefined') {
        try {
          root.style.setProperty(property, value);
          appliedVariables.push(property);
        } catch (error) {
          console.warn(`  ⚠️ Failed to set ${property}:`, error);
          failedVariables.push({ property, value, error: error.message });
        }
      }
    });

    // Apply feature-based styles
    applyFeatureStyles(features, root, config, quickHelpEnabled, actionChipsEnabled, calloutEnabled);
    
    // Apply chat positioning
    applyChatPositioning(branding.chat_position, root);
    
    // Apply advanced computed styles
    applyComputedStyles(cssVariables, root);

    console.log(`🎨 Applied ${appliedVariables.length} CSS variables`);
    console.log(`🎯 Configuration applied:`, {
      primaryColor: cssVariables['--primary-color'],
      spacing: cssVariables['--message-spacing'],
      radius: cssVariables['--border-radius'],
      dimensions: `${cssVariables['--chat-width']} × ${cssVariables['--chat-height']}`
    });
    
    if (failedVariables.length > 0) {
      console.warn(`⚠️ ${failedVariables.length} variables failed:`, failedVariables);
    }

    // Store current config for debugging
    window.currentPicassoConfig = config;
    window.appliedCSSVariables = cssVariables;

    // Cleanup function
    return () => {
      console.log('🧹 Cleaning up CSS variables...');
      appliedVariables.forEach(property => {
        root.style.removeProperty(property);
      });
    };
  }, [config]);
}

/* === HELPER FUNCTIONS === */

function ensurePixelUnit(value) {
  if (!value) return value;
  if (typeof value === 'number') return `${value}px`;
  if (typeof value === 'string') {
    if (/^\d+$/.test(value.trim())) return `${value}px`;
    return value;
  }
  return value;
}

function calculateSmallRadius(mainRadius) {
  if (!mainRadius) return '8px';
  const numValue = parseInt(mainRadius);
  return `${Math.max(4, Math.round(numValue * 0.67))}px`;
}

function calculateLargeRadius(mainRadius) {
  if (!mainRadius) return '16px';
  const numValue = parseInt(mainRadius);
  return `${Math.round(numValue * 1.33)}px`;
}

function calculateWidgetPosition(chatPosition, dimension) {
  const position = (chatPosition || 'Bottom Right').toLowerCase();
  
  const positions = {
    'bottom right': { bottom: '24px', right: '24px', top: 'auto', left: 'auto' },
    'bottom left': { bottom: '24px', left: '24px', top: 'auto', right: 'auto' },
    'top right': { top: '24px', right: '24px', bottom: 'auto', left: 'auto' },
    'top left': { top: '24px', left: '24px', bottom: 'auto', right: 'auto' }
  };
  
  const pos = positions[position] || positions['bottom right'];
  return pos[dimension] || 'auto';
}

function calculateTransformOrigin(chatPosition) {
  const position = (chatPosition || 'Bottom Right').toLowerCase();
  const transformOrigins = {
    'bottom-right': 'bottom right',
    'bottom-left': 'bottom left', 
    'top-right': 'top right',
    'top-left': 'top left'
  };
  return transformOrigins[position.replace(' ', '-')] || 'bottom right';
}

/* === AVATAR SYSTEM === */

function generateAvatarUrl(config) {
  const { tenant_id, branding, _cloudfront } = config || {};
  
  console.log('🖼️ Generating avatar URL for:', tenant_id);
  
  // Priority order for avatar sources
  const avatarSources = [
    // Direct URLs from config (highest priority)
    branding?.avatar_url,
    branding?.logo_url,
    branding?.bot_avatar_url,           
    branding?.icon,                     
    branding?.custom_icons?.bot_avatar,
    
    // CloudFront generated URLs
    _cloudfront?.urls?.avatar,
    _cloudfront?.urls?.logo,
    
    // Generic CloudFront paths
    `https://chat.myrecruiter.ai/tenants/${tenant_id}/avatar.png`,
    `https://chat.myrecruiter.ai/tenants/${tenant_id}/logo.png`,
    `https://chat.myrecruiter.ai/tenants/${tenant_id}/avatar.svg`,
    `https://chat.myrecruiter.ai/tenants/${tenant_id}/logo.svg`,
    
    // Generic fallback
    'https://chat.myrecruiter.ai/tenants/default-avatar.png',
    '/default-avatar.png'
  ];
  
  const finalUrl = avatarSources.find(url => url && url.trim() && url !== 'undefined') || '/default-avatar.png';
  
  console.log('✅ Selected avatar URL:', finalUrl);
  
  return `url(${finalUrl})`;
}

function determineAvatarBorderRadius(avatarShape) {
  const shape = (avatarShape || 'circle').toLowerCase();
  const shapeStyles = {
    'circle': '50%',
    'rounded': '8px', 
    'square': '0px',
    'hidden': '50%'
  };
  return shapeStyles[shape] || '50%';
}

function generateUserBubbleGradient(color) {
  if (!color) return 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)';
  const darkened = darkenColor(color, 10);
  return `linear-gradient(135deg, ${color} 0%, ${darkened} 100%)`;
}

function generateHeaderGradient(color) {
  if (!color) return 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)';
  const darkened = darkenColor(color, 8);
  return `linear-gradient(135deg, ${color} 0%, ${darkened} 100%)`;
}

function generatePrimaryGradient(color) {
  if (!color) return 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)';
  const darkened = darkenColor(color, 12);
  return `linear-gradient(135deg, ${color} 0%, ${darkened} 100%)`;
}

function generateWidgetGradient(color) {
  if (!color) return 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)';
  const darkened = darkenColor(color, 6);
  return `linear-gradient(135deg, ${color} 0%, ${darkened} 100%)`;
}

function generateActionChipShadow(primaryColor) {
  const rgb = hexToRgb(primaryColor || '#3b82f6');
  if (!rgb) return '0 4px 12px rgba(59, 130, 246, 0.25), 0 1px 3px rgba(59, 130, 246, 0.1)';
  return `0 4px 12px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25), 0 1px 3px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`;
}

function generateCloseButtonHoverBg(branding) {
  const headerBg = branding.header_background_color || branding.title_bar_color || '#3b82f6';
  return isLightColor(headerBg) ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.25)';
}

function generateCloseButtonHoverColor(branding) {
  const headerBg = branding.header_background_color || branding.title_bar_color || '#3b82f6';
  return isLightColor(headerBg) ? '#374151' : '#ffffff';
}

function determineHeaderTextColor(branding) {
  // 1. Use explicit header_text_color if provided
  if (branding.header_text_color) {
    return branding.header_text_color;
  }
  // 2. Otherwise, fall back to brightness calculation or forceWhite flag
  const headerBg = branding.header_background_color || branding.title_bar_color || '#3b82f6';
  const forceWhite = branding.enable_white_title || branding.white_title;
  if (forceWhite) {
    return '#ffffff';
  }
  return isLightColor(headerBg) ? '#1f2937' : '#ffffff';
}

function determineContrastColor(backgroundColor) {
   return isLightColor(backgroundColor) ? '#1f2937' : '#ffffff';
}

function generateFocusRing(color) {
  const rgb = hexToRgb(color || '#3b82f6');
  if (!rgb) return '0 0 0 3px rgba(59, 130, 246, 0.2)';
  return `0 0 0 3px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`;
}

function generateInputFocusRing(color) {
  const rgb = hexToRgb(color || '#3b82f6');
  if (!rgb) return 'rgba(59, 130, 246, 0.1)';
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`;
}

function generateInputDividerFocusColor(color) {
  const rgb = hexToRgb(color || '#3b82f6');
  if (!rgb) return 'rgba(59, 130, 246, 0.1)';
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`;
}

// Feature styles with new config structure
function applyFeatureStyles(features, root, config, quickHelpEnabled, actionChipsEnabled, calloutEnabled) {
  console.log('🎛️ Applying feature styles');
  
  // Feature classes for additional styling
  const featureClasses = [];
  if (!features.uploads) featureClasses.push('feature-uploads-disabled');
  if (!features.voice_input) featureClasses.push('feature-voice-disabled');
  if (!quickHelpEnabled) featureClasses.push('feature-quick-help-disabled');
  if (!actionChipsEnabled) featureClasses.push('feature-action-chips-disabled');
  if (!calloutEnabled) featureClasses.push('feature-callout-disabled');
  
  // Remove existing feature classes
  document.body.classList.remove(
    'feature-uploads-disabled',
    'feature-voice-disabled', 
    'feature-quick-help-disabled',
    'feature-action-chips-disabled',
    'feature-callout-disabled'
  );
  
  // Add current feature classes
  if (featureClasses.length > 0) {
    document.body.classList.add(...featureClasses);
  }
  
  console.log('✅ Feature styles applied:', {
    quickHelpEnabled,
    actionChipsEnabled,
    calloutEnabled,
    appliedClasses: featureClasses
  });
}

function applyChatPositioning(chatPosition, root) {
  const position = (chatPosition || 'Bottom Right').toLowerCase();
  const positionClass = position.replace(' ', '-');
  root.style.setProperty('--chat-position-class', positionClass);
  
  const transformOrigins = {
    'bottom-right': 'bottom right',
    'bottom-left': 'bottom left', 
    'top-right': 'top right',
    'top-left': 'top left'
  };
  
  root.style.setProperty('--chat-transform-origin', transformOrigins[positionClass] || 'bottom right');
  console.log(`  ✅ Chat position: ${position}`);
}

function applyComputedStyles(variables, root) {
  console.log('🧮 Computing advanced styles...');
  
  const primaryColor = variables['--primary-color'];
  if (primaryColor && primaryColor.startsWith('#')) {
    try {
      const rgb = hexToRgb(primaryColor);
      if (rgb) {
        root.style.setProperty('--primary-shadow-computed', `0 4px 12px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25)`);
        root.style.setProperty('--primary-shadow-hover-computed', `0 8px 20px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35)`);
        root.style.setProperty('--primary-shadow-light-computed', `0 2px 8px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`);
      }
    } catch (e) {
      console.warn('Shadow computation failed:', e);
    }
  }
  
  // Compute focus ring colors
  const focusColor = variables['--input-focus-color'];
  if (focusColor) {
    const rgb = hexToRgb(focusColor);
    if (rgb) {
      root.style.setProperty('--focus-ring-computed', `0 0 0 3px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`);
    }
  }
  
  console.log('✅ Advanced styles computed');
}

function isLightColor(color) {
  if (!color || typeof color !== 'string') return true;
  const hex = color.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128;
}

function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return null;
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function darkenColor(color, percent) {
  if (!color || !color.startsWith('#')) return color;
  
  try {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, (num >> 16) - amt);
    const G = Math.max(0, (num >> 8 & 0x00FF) - amt);
    const B = Math.max(0, (num & 0x0000FF) - amt);
    
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B)
      .toString(16)
      .slice(1);
  } catch (e) {
    console.warn('Color darkening failed:', e);
    return color;
  }
}

function lightenColor(color, percent) {
  if (!color || !color.startsWith('#')) return color;
  
  try {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, (num >> 16) + amt);
    const G = Math.min(255, (num >> 8 & 0x00FF) + amt);
    const B = Math.min(255, (num & 0x0000FF) + amt);
    
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B)
      .toString(16)
      .slice(1);
  } catch (e) {
    console.warn('Color lightening failed:', e);
    return color;
  }
}

// Component wrapper to inject CSS variables
export function CSSVariablesProvider({ children }) {
  const { config } = useConfig();
  
  useCSSVariables(config);
  
  useEffect(() => {
    window.configProvider = { config };
    window.currentTenantConfig = config;
    console.log('🎨 CSS variables provider ready');
  }, [config]);

  return children;
}

// Development and testing helpers
if (typeof window !== 'undefined') {
  // Global function to test CSS variable updates
  window.testCSS = (property, value) => {
    console.log(`🧪 Testing CSS update: ${property} = ${value}`);
    document.documentElement.style.setProperty(property, value);
  };
  
  // Test themes
  window.applyTheme = (theme = 'default') => {
    const themes = {
      default: { 
        '--primary-color': '#3b82f6', 
        '--message-spacing': '16px',
        '--border-radius': '12px',
        '--bubble-padding': '12px 16px',
        '--chat-width': '360px',
        '--chat-height': '540px'
      },
      compact: { 
        '--primary-color': '#6b7280', 
        '--message-spacing': '12px',
        '--border-radius': '8px',
        '--bubble-padding': '8px 12px',
        '--chat-width': '320px',
        '--chat-height': '480px'
      },
      spacious: { 
        '--primary-color': '#059669', 
        '--message-spacing': '20px',
        '--border-radius': '16px',
        '--bubble-padding': '16px 20px',
        '--chat-width': '400px',
        '--chat-height': '600px'
      }
    };
    
    const selectedTheme = themes[theme] || themes.default;
    Object.entries(selectedTheme).forEach(([prop, val]) => {
      document.documentElement.style.setProperty(prop, val);
    });
    
    console.log(`🎨 Applied ${theme} theme:`, selectedTheme);
  };
  
  // Export function
  window.exportConfig = () => {
    const config = window.currentTenantConfig;
    const variables = window.appliedCSSVariables;
    
    console.log('📊 Current Configuration:', {
      config,
      variables,
      tenant_id: config?.tenant_id,
      primary_color: config?.branding?.primary_color
    });
    
    return { config, variables };
  };

  // Test functions for features
  window.testQuickHelpToggle = () => {
    const currentDisplay = document.documentElement.style.getPropertyValue('--quick-help-container-display');
    const newDisplay = currentDisplay === 'none' ? 'block' : 'none';
    document.documentElement.style.setProperty('--quick-help-container-display', newDisplay);
    console.log(`🧪 Quick Help toggled: ${newDisplay}`);
  };

  window.testActionChipsToggle = () => {
    const currentDisplay = document.documentElement.style.getPropertyValue('--action-chips-display');
    const newDisplay = currentDisplay === 'none' ? 'flex' : 'none';
    document.documentElement.style.setProperty('--action-chips-display', newDisplay);
    console.log(`🧪 Action Chips toggled: ${newDisplay}`);
  };

  // Avatar testing functions
  window.testAvatarUrl = async (url) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        console.log('✅ Avatar URL works:', url);
        resolve(true);
      };
      img.onerror = () => {
        console.log('❌ Avatar URL failed:', url);
        resolve(false);
      };
      img.src = url;
    });
  };

  window.debugAvatar = async (config) => {
    console.log('🔍 Avatar Debug:');
    const currentConfig = config || window.currentTenantConfig;
    
    if (!currentConfig) {
      console.log('❌ No config available for avatar testing');
      return;
    }

    const { tenant_id, branding } = currentConfig;
    
    const candidateUrls = [
      branding?.avatar_url,
      branding?.logo_url,
      `https://chat.myrecruiter.ai/tenants/${tenant_id}/avatar.png`,
      `https://chat.myrecruiter.ai/tenants/${tenant_id}/logo.png`,
      '/default-avatar.png'
    ].filter(url => url && url.trim());
    
    console.log('🧪 Testing avatar URLs:');
    
    for (const url of candidateUrls) {
      const works = await window.testAvatarUrl(url);
      if (works) {
        console.log('🎯 First working URL found:', url);
        document.documentElement.style.setProperty('--avatar-url', `url(${url})`);
        return `url(${url})`;
      }
    }
    
    console.log('⚠️ No working avatar URLs found, using default');
    document.documentElement.style.setProperty('--avatar-url', 'url(/default-avatar.png)');
    return 'url(/default-avatar.png)';
  };

  window.applyTestLogo = (url) => {
    console.log('🧪 Applying test logo:', url);
    document.documentElement.style.setProperty('--avatar-url', `url(${url})`);
    
    const img = new Image();
    img.onload = () => console.log('✅ Test logo applied successfully');
    img.onerror = () => console.log('❌ Test logo failed to load');
    img.src = url;
  };

  console.log(`
🛠️  PICASSO DEVELOPMENT COMMANDS:
   debugAvatar()                  - Test all avatar URLs
   applyTestLogo('url')          - Test any custom URL
   testCSS(prop, value)          - Test CSS variables
   applyTheme('default')         - Apply theme variants
   exportConfig()                - Export current config
   
   FEATURE COMMANDS:
   testQuickHelpToggle()         - Toggle quick help display
   testActionChipsToggle()       - Toggle action chips display
  `);
}