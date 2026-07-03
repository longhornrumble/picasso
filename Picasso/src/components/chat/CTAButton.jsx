// CTAButton.jsx - Context-aware call-to-action buttons
import React from 'react';
import { CTA_CLICKED } from '../../analytics/eventConstants.js';

/**
 * Emit analytics event via global notifyParentEvent
 * @param {string} eventType - Event type from eventConstants.js
 * @param {Object} payload - Event payload
 */
function emitAnalyticsEvent(eventType, payload) {
  if (typeof window !== 'undefined' && window.notifyParentEvent) {
    window.notifyParentEvent(eventType, payload);
  }
}

/**
 * CTAButton Component
 * Renders context-aware CTA buttons injected by the backend response_enhancer
 * Supports different action types: form_trigger, external_link, info_request
 * Styles are defined in theme.css
 *
 * NOTE (Hairline W2.7): this pill-button renderer is used directly (outside
 * CTAButtonGroup) by ShowcaseCard.jsx — the Showcase card is separate
 * HAIRLINE_WORKPLAN.md scope (W4.3, BLOCKED on decision D2, not yet
 * design-reviewed against the Hairline mocks). Its rendering is left
 * UNCHANGED here on purpose so the W2.7 suggestion-card restyle below does
 * not leak into that out-of-scope surface. The new Hairline menu-card row
 * treatment lives only in `CTAButtonGroup` (via the `SuggestionRow` renderer
 * below), which is MessageBubble's suggestion-card path exclusively.
 */
export default function CTAButton({ cta, onClick, disabled = false }) {
  if (!cta) return null;

  const handleClick = () => {
    if (disabled || !onClick) return;

    // Analytics: Emit CTA_CLICKED event
    emitAnalyticsEvent(CTA_CLICKED, {
      cta_id: cta.id || cta.formId || cta.form_id || cta.label,
      cta_label: cta.label || cta.text,
      cta_action: cta.action || 'unknown',
      triggers_form: cta.action === 'form_trigger' || cta.action === 'start_form'
    });

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
 * SuggestionRow — Hairline menu-card row renderer for suggestion CTAs
 * (DESIGN_SPEC.md screen 3 "Suggestion card" / screen 4 "Feedback given").
 * Internal to this module; used only by `CTAButtonGroup` below.
 *
 * Anatomy per the mock (bundle `10a In-flight`, verified against the literal
 * markup — see hairline-thread.css's W2.7 section header comment for the
 * documented divergence from DESIGN_SPEC.md's Design Tokens table): label
 * left, arrow (`--tenant-accent`) right. The row whose `_position ===
 * 'primary'` is emphasized — tint fill, 700 weight, `--tenant-accent-deep`
 * text; every other row is standard (`--ink`, 600 weight, no fill).
 *
 * Dispatch is byte-identical to the pre-Hairline pill button: same
 * `emitAnalyticsEvent(CTA_CLICKED, …)` payload, same `onClick(cta)` call
 * with the untouched cta object. Only the rendered markup/classes changed.
 */
function SuggestionRow({ cta, onClick, disabled, isPrimary }) {
  if (!cta) return null;

  const handleClick = () => {
    if (disabled || !onClick) return;

    // Analytics: Emit CTA_CLICKED event (identical payload shape to CTAButton)
    emitAnalyticsEvent(CTA_CLICKED, {
      cta_id: cta.id || cta.formId || cta.form_id || cta.label,
      cta_label: cta.label || cta.text,
      cta_action: cta.action || 'unknown',
      triggers_form: cta.action === 'form_trigger' || cta.action === 'start_form'
    });

    // Pass the entire CTA object to the parent handler — same contract as
    // CTAButton; handleCtaClick/_position semantics are frozen.
    onClick(cta);
  };

  const buttonLabel = cta.label || cta.text;

  return (
    <button
      type="button"
      className={`hairline-suggestion-row${isPrimary ? ' hairline-suggestion-row--primary' : ''}`}
      onClick={handleClick}
      disabled={disabled}
      data-action={cta.action}
      data-type={cta.type}
      aria-label={buttonLabel}
    >
      <span className="hairline-suggestion-row-label">{buttonLabel}</span>
      <span className="hairline-suggestion-row-arrow" aria-hidden="true">
        &rarr;
      </span>
    </button>
  );
}

/**
 * CTAButtonGroup Component
 *
 * Hairline redesign (W2.7): renders CTAs as a bordered menu-anatomy card of
 * rows (DESIGN_SPEC.md screen 3 "Suggestion card") instead of the old
 * pill-button row. `_position: 'primary'` gets the emphasized row treatment;
 * everything else is a standard row. Click dispatch (`onCtaClick`, wired to
 * MessageBubble's frozen `handleCtaClick`) and the `_position` contract are
 * unchanged — only the rendered markup changed.
 *
 * "Disappears once used" (DESIGN_SPEC.md screen 3: "suggestions render only
 * under the latest bot message and disappear once used"; HAIRLINE_WORKPLAN.md
 * W2.7: "current: disabled-after-click styling becomes removed-after-use"):
 * once ANY cta in this group has been clicked — signaled by a non-empty
 * `clickedButtonIds` (set by MessageBubble.handleCtaClick, itself untouched)
 * — the entire card is removed from render instead of showing disabled rows.
 * This is a presentation-only change; it does not touch dispatch.
 *
 * ("Renders only under the latest bot message" is enforced by the caller —
 * see MessageBubble.jsx's `isLatestBotMessage` gate — since this component
 * has no visibility into sibling messages.)
 */
export function CTAButtonGroup({ ctas = [], onCtaClick, disabled = false, clickedButtonIds = new Set() }) {
  if (!ctas || ctas.length === 0) {
    return null;
  }

  // Disappear-once-used: any click recorded for this message hides the card.
  if (clickedButtonIds && clickedButtonIds.size > 0) {
    return null;
  }

  return (
    <div className="hairline-suggestion-card" role="group" aria-label="Suggested next steps">
      {ctas.map((cta, index) => (
        <SuggestionRow
          key={cta.id || `cta-${index}`}
          cta={cta}
          isPrimary={cta._position === 'primary'}
          onClick={onCtaClick}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
