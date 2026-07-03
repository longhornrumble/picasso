// ShowcaseCard.jsx - Digital flyer showcase cards for Picasso chat widget
import React from 'react';
import PropTypes from 'prop-types';
import { CheckCircle2 } from 'lucide-react';
import CTAButton from './CTAButton';

/**
 * ShowcaseCard Component
 *
 * Renders "digital flyer" showcase cards when Lambda returns a showcaseCard object.
 * Showcases programs, events, initiatives, and campaigns with rich media and CTAs.
 *
 * Props:
 * - showcaseCard: Object containing showcase data from Lambda response
 * - onCTAClick: Function to handle CTA button clicks
 * - className: Optional additional CSS class
 *
 * Hairline redesign (W4.3): unmocked surface (HAIRLINE_REDESIGN_MAPPING.md §0
 * case 2 / §4) — Turn 10 has no showcase mock, so this is a fresh Hairline
 * treatment extrapolated from the merged hairline-card vocabulary (same
 * anatomy as the forms/completion card in hairline-forms.css: `--surface-raised`
 * fill, `--hairline` border, `--radius-card`, no shadow). D2 (Chris,
 * 2026-07-02): keep + restyle, not retire.
 *
 * FROZEN: the `content_showcase` data shape (dual-read by widget + BSH per
 * TENANT_CONFIG_PIPELINE.md), what fields render, the CTA dispatch via
 * `onCTAClick`, and all ARIA semantics (roles, aria-labels, heading id).
 * Only class names + presentation changed. CSS classes now defined in
 * `src/styles/hairline-showcase.css` (was theme.css lines 4665-4829 — not
 * ported, per the fidelity rule).
 *
 * Known gap (flagged, not fixed here): `CTAButton.jsx`'s default export
 * (used below, unchanged) still renders the pre-Hairline `.cta-button`/
 * `.cta-primary`/`.cta-secondary` pill look. W2.7 (merged) deliberately left
 * that export untouched — its own header comment notes Showcase was
 * BLOCKED on D2 at the time, so the suggestion-card menu-row restyle only
 * reaches `CTAButtonGroup`/`SuggestionRow`, not the plain `CTAButton` this
 * file calls directly. Now that D2 = keep+restyle, the showcase CTA rows
 * are still old-pill-styled inside this new hairline card — expected
 * coexistence, not a defect of this item (`CTAButton.jsx` is W2.7's file,
 * out of W4.3's ownership). Flagged in the PR for a follow-up pass.
 */
export default function ShowcaseCard({ showcaseCard, onCTAClick, className = '' }) {
  if (!showcaseCard) return null;

  const {
    id,
    type,
    name,
    tagline,
    description,
    image_url,
    stats,
    testimonial,
    highlights,
    ctaButtons
  } = showcaseCard;

  // Build primary and secondary CTA arrays
  const primaryCTA = ctaButtons?.primary || null;
  const secondaryCTAs = ctaButtons?.secondary || [];

  return (
    <article
      className={`hairline-showcase ${className}`.trim()}
      role="article"
      aria-labelledby={`showcase-${id}-title`}
      data-showcase-id={id}
      data-showcase-type={type}
    >
      {/* Hero Image */}
      {image_url && (
        <img
          src={image_url}
          alt={name}
          className="hairline-showcase-image"
          loading="lazy"
          onError={(e) => {
            // Hide image on error
            e.target.style.display = 'none';
            console.warn(`[ShowcaseCard] Failed to load image: ${image_url}`);
          }}
        />
      )}

      {/* Content Section */}
      <div className="hairline-showcase-content">
        {/* Type Badge */}
        {type && (
          <span className="hairline-showcase-type" aria-label={`Type: ${type}`}>
            {type}
          </span>
        )}

        {/* Title */}
        {name && (
          <h3
            id={`showcase-${id}-title`}
            className="hairline-showcase-title"
          >
            {name}
          </h3>
        )}

        {/* Tagline */}
        {tagline && (
          <p className="hairline-showcase-tagline">
            {tagline}
          </p>
        )}

        {/* Description */}
        {description && (
          <p className="hairline-showcase-description">
            {description}
          </p>
        )}

        {/* Stats Badge */}
        {stats && (
          <p className="hairline-showcase-stats" aria-label="Statistics">
            {stats}
          </p>
        )}

        {/* Testimonial */}
        {testimonial && (
          <blockquote className="hairline-showcase-testimonial" role="blockquote">
            {testimonial}
          </blockquote>
        )}

        {/* Highlights - Two Column Grid */}
        {highlights && highlights.length > 0 && (
          <ul
            className="hairline-showcase-highlights"
            aria-label="Key highlights"
          >
            {highlights.map((highlight, index) => (
              <li key={index} className="hairline-showcase-highlight">
                <CheckCircle2
                  className="hairline-showcase-highlight-icon"
                  size={13}
                  strokeWidth={2}
                  aria-hidden="true"
                />
                <span>{highlight}</span>
              </li>
            ))}
          </ul>
        )}

        {/* CTA Actions */}
        {(primaryCTA || secondaryCTAs.length > 0) && (
          <div className="hairline-showcase-actions" role="group" aria-label="Available actions">
            {/* Primary CTA - Full Width, Prominent */}
            {primaryCTA && (
              <CTAButton
                cta={{
                  ...primaryCTA,
                  _position: 'primary'
                }}
                onClick={onCTAClick}
                disabled={false}
              />
            )}

            {/* Secondary CTAs - Smaller, In a Row */}
            {secondaryCTAs.length > 0 && (
              <div className="hairline-showcase-secondary-actions">
                {secondaryCTAs.map((cta, index) => (
                  <CTAButton
                    key={cta.id || `secondary-${index}`}
                    cta={{
                      ...cta,
                      _position: 'secondary'
                    }}
                    onClick={onCTAClick}
                    disabled={false}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

ShowcaseCard.propTypes = {
  showcaseCard: PropTypes.shape({
    id: PropTypes.string.isRequired,
    type: PropTypes.oneOf(['program', 'event', 'initiative', 'campaign']).isRequired,
    name: PropTypes.string.isRequired,
    tagline: PropTypes.string.isRequired,
    description: PropTypes.string.isRequired,
    image_url: PropTypes.string,
    stats: PropTypes.string,
    testimonial: PropTypes.string,
    highlights: PropTypes.arrayOf(PropTypes.string),
    ctaButtons: PropTypes.shape({
      primary: PropTypes.shape({
        id: PropTypes.string.isRequired,
        label: PropTypes.string.isRequired,
        action: PropTypes.string.isRequired,
        url: PropTypes.string,
        formId: PropTypes.string,
        query: PropTypes.string
      }),
      secondary: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string.isRequired,
        label: PropTypes.string.isRequired,
        action: PropTypes.string.isRequired,
        url: PropTypes.string,
        formId: PropTypes.string,
        query: PropTypes.string
      }))
    })
  }).isRequired,
  onCTAClick: PropTypes.func.isRequired,
  className: PropTypes.string
};
