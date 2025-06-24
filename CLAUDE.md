# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Picasso is an iframe-based chat widget for the MyRecruiter SaaS platform. It provides complete CSS isolation and multi-tenant support through a dual-entry architecture: a host page script that creates the iframe, and a React application running inside the iframe.

## ⚠️ Current Build Architecture Issues (2024-06-24)

**CRITICAL**: The build system is fragmented with no unified pipeline. This causes frequent development friction.

### Known Issues:
1. **File Location Chaos**:
   - `current-widget.js` (root) → manually copied to `dist/widget.js`
   - `widget-frame.html` (root) → not served in dev, different paths in staging/prod
   - Widget hardcodes port 5174 but dev server runs on 5173
   - No single source of truth for where files should be

2. **Environment Blindness**:
   - Widget.js can't import environment.js (different build context)
   - Staging requires post-build path fixing (`fix-staging-paths.js`)
   - Each environment has different file structures

3. **Common Problems**:
   - "Widget won't load" - usually port mismatch or missing files
   - "Can't find widget-frame.html" - not in public/ directory
   - "Staging paths broken" - needs manual fixing after build
   - Hours wasted on basic "get widget to show up" tasks

**See `roadmap/build-architecture.md` for the unified build pipeline solution.**

## Common Development Commands

```bash
# Development
npm run dev              # Start dev server on port 5173
npm run test:watch       # Run tests in watch mode during development

# Code Quality
npm run lint             # Check for linting errors
npm run lint:fix         # Auto-fix linting issues

# Testing
npm test                 # Run all tests once
npm run test:coverage    # Generate coverage report
npm run test:ui          # Open visual test runner

# Building
npm run build:production # Production build with clean
npm run preview          # Preview production build locally
npm run analyze          # Analyze bundle size

# Deployment
npm run deploy:staging   # Deploy to S3 staging
npm run deploy:production # Deploy to S3 production
```

## Architecture Overview

### Dual-Entry System

The widget uses a sophisticated iframe-based architecture that provides complete CSS/JS isolation:

1. **Host Script** (`current-widget.js`)
   - Injected on customer websites via `<script src="widget.js" data-tenant="HASH">`
   - Creates and manages the iframe container
   - Handles responsive sizing (90x90 minimized, 360x640 desktop, full-screen mobile)
   - Provides public API: `PicassoWidget.open()`, `.close()`, `.toggle()`, `.isOpen()`, `.onEvent()`
   - Manages widget positioning and animations

2. **Iframe Bridge** (`widget-frame.html`)
   - Minimal HTML that bootstraps the React application
   - Detects environment (dev/staging/production) and loads appropriate assets
   - Establishes PostMessage communication channel
   - Monitors state changes and notifies parent

3. **React Application** (`iframe-main.jsx`)
   - Runs inside iframe for complete isolation
   - Fetches tenant configuration from API
   - Renders chat UI with full React component tree
   - Handles all user interactions and API communications

### Component Hierarchy

```
Host Page
└── current-widget.js
    └── iframe (widget-frame.html)
        └── React App (iframe-main.jsx)
            └── ConfigProvider (tenant config & features)
                └── CSSVariablesProvider (dynamic theming)
                    └── ChatProvider (chat state & API)
                        └── ChatWidget / FullPageChat
                            ├── ChatHeader (logo, title, subtitle)
                            ├── MessageList
                            │   └── MessageBubble
                            │       ├── Markdown content (sanitized)
                            │       ├── Action chips
                            │       └── File previews
                            ├── TypingIndicator
                            ├── InputBar
                            │   └── AttachmentMenu
                            └── ChatFooter
                                └── FollowUpPromptBar
```

### Data Flow Architecture

1. **Configuration Flow**
   - Tenant hash extracted from script tag or URL
   - Config fetched from `https://chat.myrecruiter.ai/v1/widget/config/{hash}`
   - Cached in sessionStorage for 5 minutes
   - Config includes: branding, features, API endpoints, UI customization
   - Polling every 5 minutes for updates

2. **Message Flow**
   - User input → ChatProvider → API call with retry logic
   - API: `POST /v1/widget/chat/{tenant_hash}`
   - Exponential backoff with jitter for failures
   - Network-aware retry (auto-retry when connection restored)
   - Optimistic UI updates with rollback on failure

3. **State Management**
   - **ConfigProvider**: Tenant configuration, features, branding
   - **ChatProvider**: Messages, typing state, API communication
   - **Local State**: Widget open/closed, unread count, callout visibility

### Communication Protocol

**Host → Iframe Messages:**
```javascript
{
  type: 'PICASSO_COMMAND',
  command: 'OPEN_CHAT' | 'CLOSE_CHAT' | 'UPDATE_CONFIG' | 'SIZE_CHANGE',
  data: { /* command-specific data */ }
}
```

**Iframe → Host Events:**
```javascript
{
  type: 'PICASSO_EVENT',
  event: 'CHAT_OPENED' | 'CHAT_CLOSED' | 'MESSAGE_SENT' | 'RESIZE_REQUEST',
  data: { /* event-specific data */ }
}
```

### Security Architecture

1. **Input Sanitization**
   - DOMPurify for HTML content (strict allowlist)
   - Markdown sanitization before rendering
   - URL validation (HTTPS enforcement in production)
   - File path sanitization to prevent traversal
   - Tenant hash validation (alphanumeric only)

2. **API Security**
   - CORS-compliant requests
   - No credentials in URLs
   - Request timeout enforcement
   - Error message sanitization

3. **Iframe Isolation**
   - No sandbox attribute (but still isolated)
   - Content Security Policy headers
   - Cross-origin communication only via PostMessage

### CSS Architecture

- **2000+ lines** of scoped CSS in `src/styles/theme.css`
- **CSS Variables** for complete theming control
- **Container queries** for responsive design within iframe
- **Feature flags** control display of UI elements
- **No viewport media queries** - all responsive behavior via container queries

### Multi-Tenant Features

1. **Configuration Options**
   - Branding: logo, colors, header text
   - Features: voice input, file upload, quick help menu
   - Behavior: auto-open, typing indicators, action chips
   - Position: bottom-right, bottom-left, top-right, top-left

2. **Tenant Identification**
   - Hash in script tag: `data-tenant="fo85e6a06dcdf4"`
   - URL parameter: `?tenant=HASH`
   - Configuration endpoint: `/v1/widget/config/{hash}`

### Performance Optimizations

1. **Bundle Size**
   - Widget.js: <150KB (gzipped)
   - Lazy loading of markdown parser
   - CSS code splitting

2. **Caching Strategy**
   - Config: 5-minute sessionStorage cache
   - Static assets: 1-year cache (hashed filenames)
   - Widget.js: 5-minute cache for updates

3. **Load Performance**
   - Target: <500ms iframe load
   - Target: <200ms config fetch
   - Performance metrics logged in development

### Testing Infrastructure

1. **Test Pages**
   - `harsh-css-test.html`: CSS isolation validation
   - `size-test.html`: Responsive design testing
   - `tenant-*-demo.html`: Multi-tenant testing
   - `iframe-test.html`: Communication protocol testing

2. **Test Utilities**
   - Comprehensive browser API mocks in `src/test/setup.js`
   - Security testing for XSS prevention
   - Error handling and retry logic tests
   - Component rendering tests

### Deployment Architecture

1. **Build Outputs**
   - `widget.js`: Host-side script (IIFE format)
   - `widget-frame.html`: Iframe HTML
   - `iframe-main.js`: React application
   - `widget.css`: All styles

2. **AWS Infrastructure**
   - S3 buckets: `picassostaging`, `picassocode`
   - CloudFront CDN distribution
   - Automated deployment via `npm run deploy:*`

3. **Cache Control**
   - Short (5 min): widget.js, widget-frame.html
   - Medium (1 hour): iframe-main.js
   - Long (1 year): hashed assets

### Key Development Patterns

1. **Iframe Development**: The widget auto-detects localhost and loads from Vite dev server (port 5174) in development mode.

2. **CSS Isolation**: All styles are scoped within the iframe. Use `data-iframe-context` attributes for targeting.

3. **Multi-Tenant Support**: Tenants identified by hash in script tag. Config cached for 5 minutes in sessionStorage.

4. **Performance Targets**:
   - Iframe load: < 500ms
   - Config fetch: < 200ms
   - Widget.js bundle: < 150KB

5. **Testing Strategy**: 
   - Component tests with React Testing Library
   - Mocked browser APIs (postMessage, IntersectionObserver, etc.)
   - Test setup in `src/test/setup.js`

6. **Security**: XSS protection via DOMPurify, CORS-compliant APIs, iframe sandboxing

### Important Files
- `vite.config.js`: Build configuration with multiple entry points
- `src/config/environment.js`: Environment detection and configuration
- `src/utils/security.js`: Comprehensive security utilities
- `src/utils/errorHandling.js`: Retry logic and error management
- `current-widget.js`: Production host script
- `public/widget-frame.html`: Iframe HTML template
- `src/styles/theme.css`: Complete widget styling

## PRODUCTION LAUNCH STATUS - January 2025

### Current Infrastructure
- **Bubble**: Admin console, tenant management, API configuration
- **AWS Lambda**: 5-module system (Gatekeeper + Lex/Bedrock/Responses/Utils)
- **S3/CloudFront**: Hosts Picasso widget and tenant config.json files
- **Config Flow**: Bubble → Lambda → S3 config.json → Picasso reads config

### Critical Updates Needed for Production (Night of Launch)

#### 1. **Update Config Fetching** ⚠️ CRITICAL
ConfigProvider needs to fetch from S3 instead of API:
```javascript
// src/context/ConfigProvider.jsx - Line ~60
const configUrl = `https://your-cloudfront.com/tenants/${tenantHash}/config.json`;
// Remove API auth headers, add cache control
```

#### 2. **Update Chat Endpoint** ⚠️ CRITICAL  
ChatProvider needs to point to production Lambda:
```javascript
// src/context/ChatProvider.jsx - Line ~95
const chatUrl = 'https://your-api-gateway.com/chat';
// Add proper headers: x-tenant-id, session_id
```

#### 3. **Add Lambda Timeout Protection** ⚠️ HIGH
Lambda has 30s timeout, need to handle gracefully:
- Add 25s client-side timeout
- Show user-friendly message
- Enable retry for timeout errors

#### 4. **Fix Config Caching** ⚠️ HIGH
Current 5-minute cache doesn't check for updates:
- Add version field to config.json
- Check version before using cache
- Reduce cache to 2 minutes for faster updates

#### 5. **Add Error Boundaries** ⚠️ MEDIUM
Prevent white screen crashes:
- Wrap App in ErrorBoundary
- Log errors to Lambda endpoint
- Show fallback UI with reload option

### Work Division for Tonight

**Cursor Claude Should Focus On:**
1. Update ConfigProvider.jsx for S3 config fetching
2. Update ChatProvider.jsx for Lambda endpoint
3. Add timeout handling in ChatProvider
4. Test changes locally with a real tenant

**Web Claude Should Focus On:**
1. Update deployment scripts for production URLs
2. Create smoke test script
3. Document rollback procedure
4. Monitor deployment and provide guidance

### Production Checklist
- [ ] ConfigProvider fetches from S3 CloudFront URL
- [ ] ChatProvider points to production Lambda API Gateway
- [ ] 25-second timeout protection added
- [ ] Config version checking implemented  
- [ ] Error boundaries added to prevent crashes
- [ ] Build completes without errors
- [ ] Smoke tests pass with test tenant
- [ ] CloudFront cache invalidated after deploy
- [ ] Rollback procedure documented

### Key URLs and Values
```javascript
// REPLACE THESE IN CODE:
CLOUDFRONT_URL = "https://your-actual-cloudfront.com"
API_GATEWAY_URL = "https://your-actual-api-gateway.com"
S3_BUCKET = "your-actual-bucket-name"
TEST_TENANT_HASH = "your-test-tenant-hash"
```

### If Something Goes Wrong
1. **Config not loading**: Check S3 bucket permissions and CORS
2. **Chat not responding**: Check Lambda logs in CloudWatch
3. **Widget not appearing**: Check CloudFront distribution status
4. **Errors in console**: Check browser network tab for failed requests

### Post-Launch TODOs
- Add connection status indicator
- Add message retry queue for offline
- Add conversation continuity (localStorage)
- Add typing indicators from Lex
- Add CloudWatch metrics dashboard

## PHASE 1 IMPLEMENTATION PLAN - LAUNCH NIGHT

### Timeline: 2-3 Hours Total

#### Phase 1.1: Update ConfigProvider for S3/CloudFront (30 mins)
**Owner: Agent 1 - Config Specialist**
- Update fetch URL from API to S3: `https://your-cloudfront.com/tenants/${tenantHash}/config.json`
- Remove authentication headers
- Add version checking to cache
- Reduce cache timeout: 5 min → 2 min
- Handle 404 errors gracefully

**Test Checkpoints:**
- [ ] Valid tenant loads config from S3
- [ ] Invalid tenant shows fallback config
- [ ] Cache refreshes after 2 minutes
- [ ] No console errors in production

#### Phase 1.2: Update ChatProvider for Lambda (30 mins)
**Owner: Agent 2 - API Integration Specialist**
- Update endpoint to Lambda API Gateway
- Add required headers: x-tenant-id, x-session-id
- Implement 25-second timeout (Lambda limit: 30s)
- Add user-friendly timeout messages
- Enable retry for timeout errors only

**Test Checkpoints:**
- [ ] Messages reach Lambda endpoint
- [ ] Timeout triggers at 25 seconds
- [ ] Retry button appears on timeout
- [ ] Headers properly sent with requests

#### Phase 1.3: Security & Build Configuration (30 mins)
**Owner: Agent 3 - Security Specialist**
- Fix postMessage wildcard vulnerability
- Configure production terser settings
- Remove all console.logs in production
- Set up proper CORS origins
- Add Content Security Policy headers

**Test Checkpoints:**
- [ ] PostMessage only accepts allowed origins
- [ ] No console.logs in production build
- [ ] Bundle size < 150KB
- [ ] Security headers properly set

#### Phase 1.4: Error Handling & Monitoring (30 mins)
**Owner: Agent 4 - Reliability Specialist**
- Create ErrorBoundary component
- Add Lambda error logging endpoint
- Implement graceful fallbacks
- Add basic performance tracking
- Set up health check endpoint

**Test Checkpoints:**
- [ ] Errors don't crash widget
- [ ] Errors logged to Lambda
- [ ] Fallback UI displays correctly
- [ ] Performance metrics captured

#### Phase 1.5: Testing & Validation (30 mins)
**Owner: Agent 5 - QA Specialist**
- Create production smoke tests
- Test with real tenant data
- Validate all API endpoints
- Check mobile responsiveness
- Document any issues found

**Test Checkpoints:**
- [ ] All smoke tests pass
- [ ] Real tenant config loads
- [ ] Chat messages send/receive
- [ ] Mobile layout works

### AGENT TEAM COORDINATION

**Project Lead (This Agent):**
- Coordinate all agents
- Update CLAUDE.md documentation
- Monitor progress
- Handle blockers
- Final integration testing

**Communication Protocol:**
1. Each agent works in their lane
2. Report completion of test checkpoints
3. Flag blockers immediately
4. No cross-dependencies until integration

### CRITICAL SUCCESS FACTORS
1. **NO BREAKING CHANGES** - Widget must remain backward compatible
2. **TEST AFTER EACH CHANGE** - Don't batch changes without testing
3. **ROLLBACK READY** - Keep current version accessible
4. **DOCUMENT EVERYTHING** - Update this file with actual values

### ACTUAL VALUES TO REPLACE
```javascript
// These MUST be replaced before deployment
CLOUDFRONT_URL = "https://d2xxxxxxxxxxxxx.cloudfront.net"
API_GATEWAY_URL = "https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/prod"
S3_BUCKET = "picasso-production-configs"
TEST_TENANT_HASH = "test_tenant_12345"
ERROR_ENDPOINT = "https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/prod/errors"
```

### EMERGENCY ROLLBACK PROCEDURE
1. Revert to previous S3 version: `aws s3 cp s3://backup/widget.js s3://prod/widget.js`
2. Invalidate CloudFront: `aws cloudfront create-invalidation --distribution-id EXXXXXXXXXX --paths "/*"`
3. Update Lambda alias to previous version
4. Notify customers of temporary rollback

### PHASE 1 COMPLETION CHECKLIST
- [ ] All agents report completion
- [ ] Integration tests pass
- [ ] Production smoke tests pass
- [ ] Performance within budget (<500ms load)
- [ ] Security vulnerabilities fixed
- [ ] Documentation updated
- [ ] Rollback procedure tested