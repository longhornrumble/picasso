// CTAButton.jsx - Context-aware call-to-action buttons
import React from 'react';

/**
 * CTAButton Component
 * Renders context-aware CTA buttons injected by the backend response_enhancer
 * Supports different action types: form_trigger, external_link, info_request
 * Styles are defined in theme.css
 */
export default function CTAButton({ cta, onClick, disabled = false }) {
  if (!cta) return null;

  const handleClick = () => {
    if (disabled || !onClick) return;

    // Pass the entire CTA object to the parent handler
    onClick(cta);
  };

  // Determine button style class based on position metadata
  // Backend provides _position metadata: 'primary' or 'secondary'
  // Primary CTAs get brand color (cta-primary)
  // Secondary CTAs get outlined style (cta-secondary)
  // Fallback to action-based styling for backward compatibility
  const styleClass = cta._position === 'primary' ? 'cta-primary' :
                    cta._position === 'secondary' ? 'cta-secondary' :
                    cta.action === 'form_trigger' || cta.action === 'start_form' ? 'cta-primary' :
                    'cta-secondary';

  const buttonLabel = cta.label || cta.text;

  return (
    <button
      className={`cta-button ${styleClass}`}
      onClick={handleClick}
      disabled={disabled}
      data-action={cta.action}
      data-type={cta.type}
      title={buttonLabel}
    >
      {buttonLabel}
    </button>
  );
}

/**
 * CTAButtonGroup Component
 * Renders a group of CTA buttons
 */
export function CTAButtonGroup({ ctas = [], onCtaClick, disabled = false, clickedButtonIds = new Set() }) {
  if (!ctas || ctas.length === 0) {
    return null;
  }

  return (
    <div className="cta-button-group">
      {ctas.map((cta, index) => {
        // Generate button ID (must match the ID generation in handleCtaClick)
        const buttonId = cta.id || cta.formId || cta.form_id || cta.label;
        const isClicked = clickedButtonIds.has(buttonId);

        return (
          <CTAButton
            key={cta.id || `cta-${index}`}
            cta={cta}
            onClick={onCtaClick}
            disabled={disabled || isClicked}
          />
        );
      })}
    </div>
  );
}