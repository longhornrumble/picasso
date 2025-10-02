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

  // Determine button style class
  // If no explicit style, default based on action type:
  // - form_trigger actions = primary (brand color)
  // - external_link = secondary (outlined)
  // - info_request = info (light background)
  const styleClass = cta.style === 'primary' ? 'cta-primary' :
                    cta.style === 'secondary' ? 'cta-secondary' :
                    cta.style === 'info' ? 'cta-info' :
                    cta.action === 'form_trigger' ? 'cta-primary' :
                    cta.action === 'external_link' ? 'cta-secondary' :
                    'cta-info';

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