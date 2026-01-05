# Changelog

All notable changes to the Picasso Chat Widget will be documented in this file.

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
