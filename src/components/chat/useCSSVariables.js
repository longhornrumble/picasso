// src/hooks/useCSSVariables.js - Generic Multi-Tenant CSS System
import { useEffect } from 'react';
import { useConfig } from '../../hooks/useConfig';

export function useCSSVariables(config) {
  useEffect(() => {
    const root = document.documentElement;
    
    // Debug: Log the full config structure and timing
    console.log('🔍 useCSSVariables called at:', new Date().toISOString());
    console.log('🔍 useCSSVariables received config:', config);
    console.log('🔍 Config type:', typeof config);
    console.log('🔍 Config branding:', config?.branding);
    console.log('🔍 Config keys:', config ? Object.keys(config) : 'no config');
    
    // Handle loading state - if config is null/undefined, just return (don't warn yet)
    if (!config) {
      console.log('⏳ Config not loaded yet, waiting...');
      return;
    }

    // Handle case where branding might be missing - create default branding
    const branding = config.branding || {
      primary_color: '#3b82f6',
      background_color: '#ffffff',
      font_color: '#374151'
    };

    if (!config.branding) {
      console.warn('⚠️ No branding config found, using defaults');
    } else {
      console.log('✅ Found branding config:', config.branding);
    }

    console.log('🎨 Applying CSS variables for tenant:', config.tenant_hash || config.tenant_id);
    
    const features = config.features || {};

    // Action chips configuration
    const actionChipsConfig = features.action_chips || {};
    const actionChipsEnabled = typeof actionChipsConfig === 'object' 
      ? actionChipsConfig.enabled !== false 
      : features.action_chips !== false;

    // Quick help configuration  
    const quickHelpConfig = features.quick_help || {};
    const quickHelpEnabled = typeof quickHelpConfig === 'object' 
      ? quickHelpConfig.enabled !== false 
      : features.quick_help !== false;

    // Callout configuration
    const calloutConfig = features.callout || {};
    const calloutEnabled = typeof calloutConfig === 'object' 
      ? calloutConfig.enabled !== false 
      : features.callout !== false;

    // Generate CSS variables object
    const cssVariables = {

      /* === BASE COLOR SYSTEM === */
      '--primary-color': branding.primary_color || '#3b82f6',
      '--primary-light': branding.primary_light || lightenColor(branding.primary_color || '#3b82f6', 15),
      '--primary-dark': branding.primary_dark || darkenColor(branding.primary_color || '#3b82f6', 15),
      '--secondary-color': branding.secondary_color || '#6b7280',
      '--font-color': branding.font_color || '#374151',
      '--background-color': branding.background_color || '#ffffff',
      '--border-color': branding.border_color || 'rgba(59, 130, 246, 0.1)',
      '--success-color': branding.success_color || '#10b981',
      '--warning-color': branding.warning_color || '#f59e0b',
      '--error-color': branding.error_color || '#ef4444',
      '--info-color': branding.info_color || '#3b82f6',
      
      /* === CHAT BUBBLE COLORS === */
      '--user-bubble-color': branding.user_bubble_color || branding.primary_color || '#3b82f6',
      '--user-bubble-text-color': branding.user_bubble_text_color || determineContrastColor(branding.user_bubble_color || branding.primary_color || '#3b82f6'),
      '--bot-bubble-color': branding.bot_bubble_color || '#f8fafc',
      '--bot-bubble-text-color': branding.bot_bubble_text_color || branding.font_color || '#374151',
      '--bot-bubble-border': branding.bot_bubble_border || branding.border_color || 'rgba(59, 130, 246, 0.1)',
      
      /* === INTERFACE COLORS === */
      '--header-background-color': branding.header_background_color || branding.primary_color || '#3b82f6',
      '--header-text-color': branding.header_text_color || determineHeaderTextColor(branding),
      '--widget-icon-color': branding.widget_icon_color || '#ffffff',
      '--widget-background-color': branding.widget_background_color || branding.primary_color || '#3b82f6',
      '--link-color': branding.link_color || branding.primary_color || '#3b82f6',
      '--link-hover-color': branding.link_hover_color || darkenColor(branding.link_color || branding.primary_color || '#3b82f6', 10),
      
      /* === INPUT SYSTEM === */
      '--input-background-color': branding.input_background_color || branding.background_color || '#ffffff',
      '--input-border-color': branding.input_border_color || branding.border_color || 'rgba(59, 130, 246, 0.1)',
      '--input-text-color': branding.input_text_color || branding.font_color || '#374151',
      '--input-placeholder-color': branding.input_placeholder_color || '#6b7280',
      '--input-focus-color': branding.input_focus_color || branding.primary_color || '#3b82f6',
      '--input-focus-border-color': branding.input_focus_border_color || branding.primary_color || '#3b82f6',
      '--input-font-size': ensurePixelUnit(branding.input_font_size || '14px'),
      '--input-padding': branding.input_padding || '12px 16px',
      '--input-border-radius': ensurePixelUnit(branding.input_border_radius || branding.border_radius || '12px'),
      '--input-border-width': ensurePixelUnit(branding.input_border_width || '1px'),
      '--input-min-height': ensurePixelUnit(branding.input_min_height || '44px'),
      '--input-max-height': ensurePixelUnit(branding.input_max_height || '120px'),
      
      /* === TYPOGRAPHY === */
      '--font-family': branding.font_family || 'system-ui, -apple-system, sans-serif',
      '--font-size-base': ensurePixelUnit(branding.font_size || '14px'),
      '--font-size-heading': ensurePixelUnit(branding.font_size_heading || '16px'),
      '--font-size-small': ensurePixelUnit(branding.font_size_small || '12px'),
      '--font-size-large': ensurePixelUnit(branding.font_size_large || '18px'),
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
      '--border-width': ensurePixelUnit(branding.border_width || '1px'),
      '--border-width-thick': ensurePixelUnit(branding.border_width_thick || '2px'),
      
      /* === SPACING SYSTEM === */
      '--message-spacing': branding.message_spacing || '20px',
      '--bubble-padding': branding.bubble_padding || '12px 16px',
      '--container-padding': branding.container_padding || '16px',
      '--action-chip-margin': branding.action_chip_margin || '16px',
      '--action-chip-gap': branding.action_chip_gap || '8px',
      '--action-chip-container-padding': branding.action_chip_container_padding || '4px 0',
      
      /* === CHAT WIDGET DIMENSIONS === */
      '--chat-width': ensurePixelUnit(branding.chat_width || '360px'),
      '--chat-height': ensurePixelUnit(branding.chat_height || '640px'),
      '--chat-max-height': branding.chat_max_height || '80vh',
      '--chat-width-large': ensurePixelUnit(branding.chat_width_large || '400px'),
      '--chat-height-large': ensurePixelUnit(branding.chat_height_large || '700px'),
      '--chat-width-mobile': branding.chat_width_mobile || 'calc(100vw - 24px)',
      '--chat-height-mobile': branding.chat_height_mobile || 'calc(100vh - 160px)',
      '--chat-width-tablet': branding.chat_width_tablet || 'calc(100vw - 32px)',
      '--chat-height-tablet': branding.chat_height_tablet || 'calc(100vh - 140px)',
      
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
      
      /* === MESSAGE HEADER STYLING === */
      '--message-avatar-size': branding.message_avatar_size || '24px',
      '--message-sender-font-size': branding.message_sender_font_size || '13px',
      '--message-sender-font-weight': branding.message_sender_font_weight || '600',
      '--message-sender-color': branding.message_sender_color || branding.font_color || '#374151',
      
      /* === LOGO/AVATAR BACKGROUND COLORS === */
      '--logo-background-color': branding.logo_background_color || branding.avatar_background_color || 'transparent',
      '--avatar-background-color': branding.avatar_background_color || branding.logo_background_color || 'transparent',
      '--chat-header-logo-bg': branding.logo_background_color || branding.avatar_background_color || 'transparent',
      '--bot-avatar-bg': branding.avatar_background_color || branding.logo_background_color || 'transparent',
      
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
      
      /* === CALLOUT SYSTEM === */
      '--callout-background': branding.callout_background || branding.background_color || '#ffffff',
      '--callout-border-color': branding.callout_border_color || branding.border_color || 'rgba(59, 130, 246, 0.1)',
      '--callout-border-width': branding.callout_border_width || '1px',
      '--callout-border-radius': ensurePixelUnit(branding.callout_border_radius || branding.border_radius || '12px'),
      '--callout-padding': branding.callout_padding || '14px 18px',
      '--callout-min-width': ensurePixelUnit(branding.callout_min_width || '160px'),
      '--callout-max-width': ensurePixelUnit(branding.callout_max_width || '320px'),
      '--callout-font-size': ensurePixelUnit(branding.callout_font_size || '14px'),
      '--callout-text-color': branding.callout_text_color || branding.font_color || '#374151',
      '--callout-main-weight': branding.callout_main_weight || '600',
      '--callout-main-size': ensurePixelUnit(branding.callout_main_size || '14px'),
      '--callout-main-color': branding.callout_main_color || branding.font_color || '#374151',
      '--callout-subtitle-size': ensurePixelUnit(branding.callout_subtitle_size || '12px'),
      '--callout-subtitle-weight': branding.callout_subtitle_weight || '400',
      '--callout-subtitle-color': branding.callout_subtitle_color || branding.secondary_color || '#6b7280',
      '--callout-close-bg': branding.callout_close_bg || 'rgba(0, 0, 0, 0.05)',
      '--callout-close-color': branding.callout_close_color || branding.secondary_color || '#6b7280',
      '--callout-close-radius': ensurePixelUnit(branding.callout_close_radius || '50%'),
      '--callout-close-hover-bg': branding.callout_close_hover_bg || branding.border_color || 'rgba(59, 130, 246, 0.1)',
      '--callout-close-hover-color': branding.callout_close_hover_color || branding.font_color || '#374151',
      '--callout-animation-duration': branding.callout_animation_duration || '0.35s',
      
      /* === ENHANCED SHADOW SYSTEM === */
      '--bubble-shadow': branding.bubble_shadow || '0 1px 3px rgba(0, 0, 0, 0.1)',
      '--bubble-shadow-hover': branding.bubble_shadow_hover || '0 2px 8px rgba(0, 0, 0, 0.15)',
      '--primary-shadow': branding.primary_shadow || generatePrimaryShadow(branding.primary_color),
      '--primary-shadow-light': branding.primary_shadow_light || generatePrimaryShadowLight(branding.primary_color),
      '--primary-shadow-hover': branding.primary_shadow_hover || generatePrimaryShadowHover(branding.primary_color),
      '--container-shadow': branding.container_shadow || '0 10px 25px rgba(0, 0, 0, 0.1)',
      '--header-shadow': branding.header_shadow || generatePrimaryShadowLight(branding.primary_color),
      '--input-shadow': branding.input_shadow || generateInputShadow(branding.primary_color),
      '--input-focus-shadow': branding.input_focus_shadow || generateInputFocusShadow(branding.primary_color),
      '--send-button-shadow': branding.send_button_shadow || generatePrimaryShadow(branding.primary_color),
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

      '--action-chips-display': actionChipsEnabled ? 'flex' : 'none',
      '--action-chips-short-text-threshold': branding.action_chips_short_text_threshold || '16',
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
      '--quick-help-animation-duration': branding.quick_help_animation_duration || '0.375s',
      '--quick-help-slide-distance': branding.quick_help_slide_distance || '20px',
      
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

    // Check iframe context and filter variables BEFORE applying
    const isInIframe = document.body.getAttribute('data-iframe') === 'true';
    if (isInIframe) {
      console.log('🖼️ Iframe context detected - applying iframe-specific variables');
      
      // Force iframe-specific sizing variables that override everything
      cssVariables['--chat-width'] = '100%';
      cssVariables['--chat-height'] = '100%';
      cssVariables['--chat-max-height'] = '100%';
      cssVariables['--chat-width-large'] = '100%';
      cssVariables['--chat-height-large'] = '100%';
      cssVariables['--chat-width-mobile'] = '100%';
      cssVariables['--chat-height-mobile'] = '100%';
      cssVariables['--chat-width-tablet'] = '100%';
      cssVariables['--chat-height-tablet'] = '100%';
      
      // Override widget positioning to static/auto
      cssVariables['--widget-bottom'] = 'auto';
      cssVariables['--widget-right'] = 'auto';
      cssVariables['--widget-top'] = 'auto';
      cssVariables['--widget-left'] = 'auto';
      
      // Force container behavior
      cssVariables['--chat-container-position'] = 'static';
      cssVariables['--chat-container-width'] = '100%';
      cssVariables['--chat-container-height'] = '100%';
      cssVariables['--chat-container-max-height'] = '100%';
      cssVariables['--chat-container-margin'] = '0';
      cssVariables['--chat-container-border-radius'] = '0';
      
      console.log('✅ Iframe-specific CSS variables applied');
    }

    // Apply CSS variables with error handling
    const appliedVariables = [];
    const failedVariables = [];
    
    Object.entries(cssVariables).forEach(([property, value]) => {
      if (value && typeof value === 'string' && value !== 'undefined' && value !== 'null') {
        try {
          root.style.setProperty(property, value);
          appliedVariables.push(property);
        } catch (error) {
          console.warn(`⚠️ Failed to set ${property}:`, error);
          failedVariables.push({ property, value, error: error.message });
        }
      }
    });

    // Apply enhanced feature styles
    applyEnhancedFeatureStyles(features, root, config, quickHelpEnabled, actionChipsEnabled, calloutEnabled);
    
    // Apply chat positioning
    applyChatPositioning(branding.chat_position, root);
    
    // Apply advanced computed styles
    applyComputedStyles(cssVariables, root);

    console.log(`🎨 Applied ${appliedVariables.length} CSS variables for tenant: ${config.tenant_hash || config.tenant_id}`);
    
    if (failedVariables.length > 0) {
      console.warn(`⚠️ ${failedVariables.length} variables failed:`, failedVariables);
    }

    // Store current config for debugging
    window.currentPicassoConfig = config;
    window.appliedCSSVariables = cssVariables;
    window.picassoDebug = {
      config,
      appliedVariables: cssVariables,
      tenant_hash: config?.tenant_hash,
      enhancementsApplied: true,
      configSource: config.metadata?.source
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

// Generic avatar URL generation for multi-tenant system
function generateAvatarUrl(config) {
  const { tenant_hash, branding, _cloudfront } = config || {};
  
  console.log('🖼️ Generating avatar URL for tenant hash:', tenant_hash || 'no-hash');
  
  // Priority order for avatar sources - generic multi-tenant system
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
    
    // Hash-based generic paths (tenant agnostic)
    tenant_hash ? `https://chat.myrecruiter.ai/tenants/hash-${tenant_hash}/avatar.png` : null,
    tenant_hash ? `https://chat.myrecruiter.ai/tenants/hash-${tenant_hash}/logo.png` : null,
    tenant_hash ? `https://chat.myrecruiter.ai/tenants/hash-${tenant_hash}/avatar.svg` : null,
    tenant_hash ? `https://chat.myrecruiter.ai/tenants/hash-${tenant_hash}/logo.svg` : null,
    
    // Generic fallbacks
    'https://chat.myrecruiter.ai/collateral/default-avatar.png'
  ];
  
  const finalUrl = avatarSources.find(url => url && url.trim() && url !== 'undefined') || 'https://chat.myrecruiter.ai/collateral/default-avatar.png';
  
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

function generatePrimaryShadow(color) {
  const rgb = hexToRgb(color || '#3b82f6');
  if (!rgb) return '0 4px 12px rgba(59, 130, 246, 0.25)';
  return `0 4px 12px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25)`;
}

function generatePrimaryShadowLight(color) {
  const rgb = hexToRgb(color || '#3b82f6');
  if (!rgb) return '0 2px 8px rgba(59, 130, 246, 0.15)';
  return `0 2px 8px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`;
}

function generatePrimaryShadowHover(color) {
  const rgb = hexToRgb(color || '#3b82f6');
  if (!rgb) return '0 6px 16px rgba(59, 130, 246, 0.3)';
  return `0 6px 16px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`;
}

function generateInputShadow(color) {
  const rgb = hexToRgb(color || '#3b82f6');
  if (!rgb) return '0 2px 8px rgba(59, 130, 246, 0.08)';
  return `0 2px 8px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.08)`;
}

function generateInputFocusShadow(color) {
  const rgb = hexToRgb(color || '#3b82f6');
  if (!rgb) return '0 0 0 3px rgba(59, 130, 246, 0.1), 0 4px 12px rgba(59, 130, 246, 0.15)';
  return `0 0 0 3px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1), 0 4px 12px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`;
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
  // 2. Check for chat_title_color
  if (branding.chat_title_color) {
    return branding.chat_title_color;
  }
  // 3. Check for title_color (legacy)
  if (branding.title_color) {
    return branding.title_color;
  }
  // 4. Otherwise, fall back to brightness calculation or forceWhite flag
  const headerBg = branding.header_background_color || branding.title_bar_color || '#3b82f6';
  const forceWhite = branding.enable_white_title || branding.white_title;
  if (forceWhite) {
    return '#ffffff';
  }
  return isLightColor(headerBg) ? '#1f2937' : '#ffffff';
}

function generateSubtitleColor(branding) {
  // Get the header text color first
  const headerTextColor = determineHeaderTextColor(branding);
  
  // If header text is white/light, make subtitle 80% opacity
  if (headerTextColor === '#ffffff' || isLightColor(headerTextColor)) {
    return 'rgba(255, 255, 255, 0.8)';
  }
  
  // If header text is dark, make subtitle 70% opacity dark
  return 'rgba(31, 41, 55, 0.7)';
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

// Enhanced feature styles
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
  console.log(`✅ Chat position: ${position}`);
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

// Calculate small and large radii based on main radius
function calculateSmallRadius(mainRadius) {
  if (!mainRadius) return '8px';
  const numValue = parseInt(mainRadius, 10);
  return isNaN(numValue) ? '8px' : `${Math.round(numValue * 0.5)}px`;
}

function calculateLargeRadius(mainRadius) {
  if (!mainRadius) return '16px';
  const numValue = parseInt(mainRadius, 10);
  return isNaN(numValue) ? '16px' : `${Math.round(numValue * 1.5)}px`;
}

function ensurePixelUnit(value) {
  if (!value) return value;
  if (typeof value === 'number') return `${value}px`;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? value : `${parsed}px`;
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
      tenant_hash: config?.tenant_hash,
      enhancementsApplied: true,
      configSource: config?.metadata?.source || 'unknown'
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
  
  // Debug any tenant's logo background
  window.debugLogoBackground = () => {
    const config = window.currentTenantConfig;
    const root = document.documentElement;
    
    console.log('🔍 Logo Background Debug:', {
      configLogoBackground: config?.branding?.logo_background_color,
      configAvatarBackground: config?.branding?.avatar_background_color,
      cssLogoBackground: root.style.getPropertyValue('--logo-background-color'),
      cssAvatarBackground: root.style.getPropertyValue('--avatar-background-color'),
      cssChatHeaderLogoBg: root.style.getPropertyValue('--chat-header-logo-bg'),
      cssBotAvatarBg: root.style.getPropertyValue('--bot-avatar-bg')
    });
    
    // Test if logo element exists
    const logoElement = document.querySelector('.chat-header-logo');
    if (logoElement) {
      const computedStyle = window.getComputedStyle(logoElement);
      console.log('🎨 Logo Element Computed Styles:', {
        backgroundColor: computedStyle.backgroundColor,
        backgroundImage: computedStyle.backgroundImage,
        backgroundSize: computedStyle.backgroundSize,
        backgroundPosition: computedStyle.backgroundPosition
      });
    } else {
      console.log('❌ Logo element not found (.chat-header-logo)');
    }
  };

  // Test functions for generic system
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

  // Avatar testing functions - Updated for multi-tenant system
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
    console.log('🔍 Avatar Debug - Multi-Tenant System:');
    const currentConfig = config || window.currentTenantConfig;
    
    if (!currentConfig) {
      console.log('❌ No config available for avatar testing');
      return;
    }

    const { tenant_hash, branding } = currentConfig;
    
    const candidateUrls = [
      branding?.avatar_url,
      branding?.logo_url,
      tenant_hash ? `https://chat.myrecruiter.ai/tenants/hash-${tenant_hash}/avatar.png` : null,
      tenant_hash ? `https://chat.myrecruiter.ai/tenants/hash-${tenant_hash}/logo.png` : null,
      tenant_hash ? `https://chat.myrecruiter.ai/tenants/hash-${tenant_hash}/avatar.svg` : null,
      'https://chat.myrecruiter.ai/collateral/default-avatar.png'
    ].filter(url => url && url.trim());
    
    console.log('🧪 Testing avatar URLs for hash:', tenant_hash);
    
    for (const url of candidateUrls) {
      const works = await window.testAvatarUrl(url);
      if (works) {
        console.log('🎯 First working URL found:', url);
        document.documentElement.style.setProperty('--avatar-url', `url(${url})`);
        return `url(${url})`;
      }
    }
    
    console.log('⚠️ No working avatar URLs found, using default');
    document.documentElement.style.setProperty('--avatar-url', 'url(https://chat.myrecruiter.ai/collateral/default-avatar.png)');
    return 'url(https://chat.myrecruiter.ai/collateral/default-avatar.png)';
  };

  window.applyTestLogo = (url) => {
    console.log('🧪 Applying test logo:', url);
    document.documentElement.style.setProperty('--avatar-url', `url(${url})`);
    
    const img = new Image();
    img.onload = () => console.log('✅ Test logo applied successfully');
    img.onerror = () => console.log('❌ Test logo failed to load');
    img.src = url;
  };

  // Generic theme testing
  window.applyGenericTheme = (theme = 'default') => {
    const themes = {
      default: { 
        '--primary-color': '#3b82f6', 
        '--message-spacing': '16px',
        '--border-radius': '12px',
        '--bubble-padding': '12px 16px',
        '--chat-width': '360px',
        '--chat-height': '540px'
      },
      modern: { 
        '--primary-color': '#6366f1', 
        '--message-spacing': '20px',
        '--border-radius': '16px',
        '--bubble-padding': '16px 20px',
        '--chat-width': '380px',
        '--chat-height': '580px'
      },
      compact: { 
        '--primary-color': '#10b981', 
        '--message-spacing': '12px',
        '--border-radius': '8px',
        '--bubble-padding': '8px 12px',
        '--chat-width': '320px',
        '--chat-height': '480px'
      }
    };
    
    const selectedTheme = themes[theme] || themes.default;
    Object.entries(selectedTheme).forEach(([prop, val]) => {
      document.documentElement.style.setProperty(prop, val);
    });
    
    console.log(`🎨 Applied ${theme} theme:`, selectedTheme);
  };

  console.log(`
🛠️  PICASSO MULTI-TENANT CSS COMMANDS:
   debugLogoBackground()         - Debug current logo background settings
   testCSS('--property', 'value') - Test any CSS variable directly
   
🧪 FEATURE COMMANDS:
   testQuickHelpToggle()         - Toggle quick help display
   testActionChipsToggle()       - Toggle action chips display
   debugAvatar()                 - Test all avatar URLs for current tenant
   applyTestLogo('url')          - Test any custom logo URL
   
🎨 THEME TESTING:
   applyGenericTheme('default')  - Apply generic theme variants
   Available themes: 'default', 'modern', 'compact'
   
📋 SYSTEM STATUS:
   All CSS variables are tenant-agnostic with generic defaults
   No hard-coded tenant-specific references
   Ready for multi-tenant deployment
`);

  // Prevent tree-shaking of utility functions
  window.picassoUtilities = { 
    isLightColor, 
    determineContrastColor, 
    determineHeaderTextColor,
    generateAvatarUrl,
    hexToRgb,
    darkenColor,
    lightenColor
  };
}

