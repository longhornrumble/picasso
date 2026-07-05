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
 *
 * Hairline redesign (W2.7b): this is the PLAIN default export — its only
 * live consumer is `ShowcaseCard.jsx` (primary CTA full-width/prominent,
 * secondary CTAs smaller/in-a-row — see ShowcaseCard's `.hairline-showcase-
 * actions`/`.hairline-showcase-secondary-actions` container rules in
 * hairline-showcase.css). W2.7 (merged) restyled `CTAButtonGroup`/
 * `SuggestionRow` below (MessageBubble's suggestion-card path) but
 * deliberately left THIS export on the old `.cta-button`/`.cta-primary`/
 * `.cta-secondary` pill look because Showcase was still BLOCKED on D2 at
 * the time. D2 is now resolved (keep + restyle, W4.3 done), so this export
 * follows.
 *
 * Vocabulary choice: Turn 10 has no standalone CTA-button mock (the
 * showcase card itself is an unmocked surface, HAIRLINE_REDESIGN_MAPPING.md
 * §0 case 2 / §4). The closest established Hairline precedent for a
 * "primary/secondary pair of decisive-action buttons" is the conversational
 * forms submit/cancel pair (hairline-forms.css `.hairline-form-submit`/
 * `.hairline-form-cancel`, W4.1) — a solid `--tenant-accent` fill for the
 * primary action, a transparent/outlined `--hairline`-bordered button for
 * the secondary action — which also matches how ShowcaseCard already lays
 * out this button (primary full-width, secondary compact-in-a-row). Reused
 * verbatim rather than inventing a third button recipe. Flagged for the
 * design-review gate, same as W4.1/W4.3's judgment calls.
 *
 * FROZEN: click dispatch (`emitAnalyticsEvent`, `onClick(cta)`), the
 * `_position` styling contract, and the action-based fallback. Only the
 * rendered classNames/markup changed — see `ctaActionContract.test.jsx`
 * (untouched, still green) for the dispatch-contract guard.
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
  // Primary CTAs get the filled treatment (hairline-cta--primary)
  // Secondary CTAs get the outlined treatment (hairline-cta--secondary)
  // Fallback to action-based styling for backward compatibility
  const isPrimary = cta._position === 'primary' ? true :
                    cta._position === 'secondary' ? false :
                    cta.action === 'form_trigger' || cta.action === 'start_form' ? true :
                    false;
  const styleClass = isPrimary ? 'hairline-cta--primary' : 'hairline-cta--secondary';

  const buttonLabel = cta.label || cta.text;

  return (
    <button
      type="button"
      className={`hairline-cta ${styleClass}`}
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
 * left, arrow (`--tenant-accent`) right. Every row renders IDENTICAL at
 * rest — the mock's emphasized primary row (tint fill at rest) was retired
 * by spec amendment 7 (Chris, 2026-07-04): a resting tint reads as a
 * hover/selected state; the tint now appears only on actual :hover.
 * `_position` remains dispatch metadata (frozen contract) — it just no
 * longer drives a visual class here.
 *
 * Dispatch is byte-identical to the pre-Hairline pill button: same
 * `emitAnalyticsEvent(CTA_CLICKED, …)` payload, same `onClick(cta)` call
 * with the untouched cta object. Only the rendered markup/classes changed.
 */
function SuggestionRow({ cta, onClick, disabled }) {
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
      className="hairline-suggestion-row"
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
          onClick={onCtaClick}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
