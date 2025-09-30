// CTAButton.jsx - Context-aware call-to-action buttons
import React from 'react';
import './CTAButton.css';

/**
 * CTAButton Component
 * Renders context-aware CTA buttons injected by the backend response_enhancer
 * Supports different action types: form_trigger, external_link, info_request
 */
export default function CTAButton({ cta, onClick, disabled = false }) {
  if (!cta) return null;

  const handleClick = () => {
    if (disabled || !onClick) return;

    // Pass the entire CTA object to the parent handler
    onClick(cta);
  };

  // Determine button style class
  const styleClass = cta.style === 'primary' ? 'cta-primary' :
                    cta.style === 'secondary' ? 'cta-secondary' :
                    'cta-info';

  return (
    <button
      className={`cta-button ${styleClass}`}
      onClick={handleClick}
      disabled={disabled}
      data-action={cta.action}
      data-type={cta.type}
    >
      {cta.label || cta.text}
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