# Changelog

All notable changes to the Picasso Chat Widget will be documented in this file.

## [2.1.1] - 2026-01-05

### Added
- Self-hosted font system for multi-tenant deployments (Inter, Montserrat)
- `externalFontsPlugin` in ESBuild to preserve `/fonts/` URLs in CSS builds
- Build system auto-copies `public/fonts/` to `dist/<env>/fonts/`
- New `src/styles/fonts.css` with @font-face definitions
- Component tests (MessageBubble, ShowcaseCard, FormCompletionCard)
- GitHub Actions workflow for production deployment
- Comprehensive documentation (PRDs, implementation plans, wireframes)

### Changed
- Fonts served from same CDN as widget (eliminates cross-origin iframe issues)
- ~50-100ms faster than Google Fonts (same origin = no extra DNS lookups)
- Fonts shared/cached across tenants using same font family

### Fixed
- ESBuild production builds no longer drop `console` statements (was breaking useEffect hooks)
- Removed duplicate `recordFormCompletion` calls in ChatWidget (form completion now recorded via useEffect only)

### Deployment Notes
- **Deployed**: 2026-01-05T23:52:43.414Z
- **S3 Bucket**: `picassocode`
- **CloudFront Distribution**: `E3G0LSWB1AQ9LP`
- **CloudFront Invalidation**: `I2YG0Q3RBCGZBJS7LIX9RP8HUP`
- **Bundle Sizes**:
  - `widget.js`: 21.2 KB
  - `iframe-main.js`: 435.2 KB
  - `iframe-main.css`: 95.9 KB
  - `fonts/`: 82 KB (Inter + Montserrat)

---

## [2.1.0] - 2026-01-05

### Added
- Unified session ID format for form-to-conversation linking
- Form submissions now use analytics session ID (`sess_*` format) when available

### Changed
- StreamingChatProvider: Uses `window.analyticsState.sessionId` for session tracking
- HTTPChatProvider: Same session ID unification for consistency
- Session reset generates analytics-compatible `sess_<timestamp36>_<random>` format

### Fixed
- Form submissions can now be linked to their originating conversation sessions
- Analytics dashboard "View Form" feature now finds matching submissions by session_id

### Deployment Notes
- **S3 Bucket**: `picassocode`
- **CloudFront**: `E3G0LSWB1AQ9LP` (chat.myrecruiter.ai)
- **Build**: `npm run build:production`
- **Deploy**: `aws s3 sync dist/production/ s3://picassocode/`

---

## [2.0.0] - 2025-12-XX

### Added
- Initial v2.0.0 release
- Conversational forms system
- Streaming chat support
- Multi-tenant configuration
- Analytics event tracking
