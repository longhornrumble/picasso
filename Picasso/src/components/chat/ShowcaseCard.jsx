// ShowcaseCard.jsx - Digital flyer showcase cards for Picasso chat widget
import React from 'react';
import PropTypes from 'prop-types';
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
 * CSS classes defined in theme.css (lines 4665-4829)
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
      className={`showcase-card ${className}`.trim()}
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
          className="showcase-card-image"
          loading="lazy"
          onError={(e) => {
            // Hide image on error
            e.target.style.display = 'none';
            console.warn(`[ShowcaseCard] Failed to load image: ${image_url}`);
          }}
        />
      )}

      {/* Content Section */}
      <div className="showcase-card-content">
        {/* Type Badge */}
        {type && (
          <span className="showcase-card-type" aria-label={`Type: ${type}`}>
            {type}
          </span>
        )}

        {/* Title */}
        {name && (
          <h3
            id={`showcase-${id}-title`}
            className="showcase-card-title"
          >
            {name}
          </h3>
        )}

        {/* Tagline */}
        {tagline && (
          <p className="showcase-card-tagline">
            {tagline}
          </p>
        )}

        {/* Description */}
        {description && (
          <p className="showcase-card-description">
            {description}
          </p>
        )}

        {/* Stats Badge */}
        {stats && (
          <p className="showcase-card-stats" aria-label="Statistics">
            {stats}
          </p>
        )}

        {/* Testimonial */}
        {testimonial && (
          <blockquote className="showcase-card-testimonial" role="blockquote">
            {testimonial}
          </blockquote>
        )}

        {/* Highlights - Two Column Grid */}
        {highlights && highlights.length > 0 && (
          <ul
            className="showcase-card-highlights"
            aria-label="Key highlights"
          >
            {highlights.map((highlight, index) => (
              <li key={index} className="showcase-card-highlight">
                {highlight}
              </li>
            ))}
          </ul>
        )}

        {/* CTA Actions */}
        {(primaryCTA || secondaryCTAs.length > 0) && (
          <div className="showcase-card-actions" role="group" aria-label="Available actions">
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
              <div className="showcase-card-secondary-actions">
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
