# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Picasso is an iframe-based chat widget for the MyRecruiter SaaS platform. It provides complete CSS isolation and multi-tenant support through a dual-entry architecture: a host page script that creates the iframe, and a React application running inside the iframe.

## Core Philosophy: Simplification Over Complexity

**"Trim the fat"** - This codebase values:
- **Defaults over configuration**: If it works well out-of-box, don't make it configurable
- **Lean over complete**: 50 lines that work > 500 lines with edge cases  
- **Pass-through over transformation**: Let data flow naturally between systems
- **Production stability over feature richness**: Ship working code, iterate later

**Example**: Foster Village's config is 84 lines instead of 500+ because we use CSS defaults for everything except logo/colors. This is the way.

### Simplification Targets

**Master_Function** (Current: 1,350 lines → Target: 600 lines)
- `tenant_config_loader.py`: 535 lines → 200 lines (remove over-engineering)
- Consolidate error handling across all modules
- Extract shared constants to single location
- Remove redundant logging and metrics

**Picasso** (Ongoing)
- Continue CSS variable approach (working well)
- Remove unused component variations
- Simplify build pipeline (see roadmap/build-architecture.md)

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

## Recent Fixes (2025-06-26)

### URL and Email Link Preservation Issue - RESOLVED ✅

**Problem**: URLs and emails were being stripped from chat messages, appearing as plain text or `[object Object]`

**Root Cause**: 
1. Custom marked.js link renderer was using `DOMPurify.sanitize()` on URL strings, converting them to objects
2. Double processing of markdown content (in ChatProvider and MessageBubble)
3. Missing `mangle: false` option causing email obfuscation

**Solution**:
1. **Removed problematic custom renderer** that was sanitizing URLs incorrectly
2. **Added `mangle: false`** to marked.js options to preserve email addresses
3. **Created autolink extension** to convert plain URLs/emails to clickable links
4. **Post-process HTML** to add `target="_blank"` to all links
5. **Updated MessageBubble** to use pre-processed HTML from ChatProvider

**Lambda Prompt Updates**:
```python
# In bedrock_handler.py - Added instructions to preserve markdown
- PRESERVE ALL MARKDOWN FORMATTING: If you see [text](url) keep it as [text](url), not plain text
- For any dates, times, or locations of events: Direct users to check the events page or contact the team
- Never include placeholder text like [date], [time], [location], or [topic] in your responses
```

**Result**: 
- ✅ Inline markdown links from knowledge base are preserved
- ✅ Plain URLs and emails are auto-linked
- ✅ All links open in new browser tabs
- ✅ No more `[object Object]` or stripped URLs
- ✅ Event placeholders replaced with evergreen language

**Files Modified**:
- `src/context/ChatProvider.jsx` - Fixed markdown processing and link handling
- `src/components/chat/MessageBubble.jsx` - Use pre-processed HTML
- `src/utils/markdownToHTML.js` - Added autolink extension
- `vite.config.js` - Added proxy for development CORS
- `lambda-review/lambda-review/bedrock_handler.py` - Updated prompt instructions

**Commits**:
- "Fix URL and email stripping in chat messages"
- "Update Lambda prompt to preserve markdown formatting"

### Production Widget Issues - RESOLVED ✅ (2025-06-27)

**Problems**:
1. White pixels visible around chat header edges
2. Widget iframe visible/open on page load (should start closed)
3. Different behavior between header X close vs toggle close

**Root Causes**:
1. **White pixels**: Iframe body lacked transparent background, showing through the 4px padding
2. **Start state**: Widget initialization had guard clause preventing `minimize()` from running
3. **Close behavior**: Header close directly set state instead of calling `handleToggle()`

**Solutions**:
1. **Added transparent background** to iframe body in theme.css
2. **Fixed initialization** by applying minimized styles directly (removed problematic `minimize()` call)
3. **Updated header close** to use `handleToggle()` for consistent parent notification

**Additional Fix - Cache Issue**:
- **Problem**: Client saw postMessage errors and 404s for old asset files
- **Cause**: Browser cached old `widget-frame.html` with outdated asset hashes
- **Solution**: Client cleared browser cache (hard refresh)

**Files Modified**:
- `src/styles/theme.css` - Added `body[data-iframe="true"] { background: transparent }`
- `current-widget.js` - Fixed widget initialization
- `src/components/chat/ChatWidget.jsx` - Header close now uses `handleToggle()`

**Tests Updated**:
- `src/utils/__tests__/markdownToHTML.test.js` - Updated to expect target="_blank"
- `src/components/chat/__tests__/MessageBubble.test.jsx` - Updated to expect pre-processed HTML

**Deployment**:
- Production deployment: 2025-06-27_01-07-53
- Git tag: `deploy-prod-2025-06-27_01-07-53`
- CloudFront invalidation: I8PL1SYA1II0I1BHVM41KYUDYV

**Result**:
- ✅ No white pixels around widget edges
- ✅ Widget starts properly minimized
- ✅ Both close methods behave consistently
- ✅ All tests passing
- ✅ Successfully deployed to production

### Badge Count Persistence Issue - RESOLVED ✅ (2025-06-27)

**Problem**: When users clicked internal links (same domain), the page would refresh and the unread message badge would show the total message count instead of only unread messages.

**Root Cause**: 
- Internal links correctly open in the same tab for better UX
- Session data (messages, session ID) was persisted to sessionStorage
- But `lastReadMessageIndex` was only stored in React state
- On page refresh, `lastReadMessageIndex` reset to -1, making all messages appear unread

**Solution**:
1. **Added sessionStorage persistence** for `lastReadMessageIndex`
2. **Initialize from saved state** on component mount (respects 30-minute session timeout)
3. **Save index when closing chat** via the toggle button
4. **Update saved index when opening chat** to mark all messages as read

**Implementation** (ChatWidget.jsx):
- Initialize `lastReadMessageIndex` from sessionStorage if session is valid
- Save to `picasso_last_read_index` key when chat state changes
- Maintains consistency with existing session persistence behavior

**Result**:
- ✅ Badge shows only truly unread messages after page refresh
- ✅ Internal links continue to open in same tab (good UX)
- ✅ Session state fully preserved across refreshes
- ✅ Callout behavior more predictable with accurate message counts

### Chat Container Border & Shadow Visibility Issue - RESOLVED ✅ (2025-06-27)

**Problem**: Chat container border only showing on left/top sides, box shadow not visible

**Root Cause**: CSS conflict between absolute positioning and `width: 100%; height: 100%` on the chat container caused it to exceed its parent boundaries, clipping the right/bottom borders and shadow

**Solution**: Changed chat container dimensions from `width: 100%; height: 100%` to `width: auto; height: auto`, allowing the absolute positioning constraints (`top: 0; right: 0; bottom: 0; left: 0`) to properly determine the size

**Files Modified**:
- `src/styles/theme.css` - Updated `.chat-container` rule to use `width: auto; height: auto`

**Commit**: e3ea9a9

**Result**:
- ✅ All four sides of border now visible
- ✅ Box shadow properly renders around entire container
- ✅ Container still fills parent correctly via positioning constraints

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
   - Hash in script tag: `data-tenant="HASH"`
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
- **AWS Lambda**: 2-function system (deploy_tenant_stack + Master_Function)
- **S3/CloudFront**: Hosts Picasso widget and tenant config.json files
- **Config Flow**: Bubble → deploy_tenant_stack → S3 → Master_Function → Picasso

### Lambda Architecture & Integration

#### Master_Function Overview
Master_Function is a modular Lambda with 6 components:

1. **lambda_function.py** (372 lines) - Entry point, action routing
2. **intent_router.py** (191 lines) - Chat orchestration
3. **bedrock_handler.py** (75 lines) - AI/KB integration
4. **response_formatter.py** (155 lines) - Output formatting
5. **session_utils.py** (28 lines) - Session management
6. **tenant_config_loader.py** (535 lines) - Config & caching

**Key Features:**
- Hash-only security (no tenant_id exposure)
- 5-minute in-memory config caching
- S3 fallback for resilience
- CloudFront integration
- Supports both Lex and HTTP requests

#### Master_Function API Endpoints
The production Lambda uses action-based routing with query parameters:

```javascript
// Config endpoint (WORKING IN PRODUCTION)
GET https://chat.myrecruiter.ai/Master_Function?action=get_config&t={tenant_hash}

// Chat endpoint
POST https://chat.myrecruiter.ai/Master_Function?action=chat&t={tenant_hash}
Body: {
  "tenant_hash": "HASH",
  "user_input": "Hello, how can I get help?",
  "session_id": "session_123456",
  "context": {} // optional
}

// Health check
GET https://chat.myrecruiter.ai/Master_Function?action=health_check&t={tenant_hash}

// Cache operations
GET https://chat.myrecruiter.ai/Master_Function?action=cache_status
POST https://chat.myrecruiter.ai/Master_Function?action=clear_cache&t={tenant_hash}
```

#### 🚨 CRITICAL: Production 404 Fix (IMMEDIATE)

If you see 404 errors on config fetching:

1. **Check CloudFront Query String Forwarding**:
   ```bash
   # CloudFront must forward query strings
   # Console → Behaviors → Edit → Cache Key and Origin Requests → Query Strings → "All"
   ```

2. **Update ConfigProvider.jsx**:
   ```javascript
   // CORRECT endpoint format with fallbacks
   const configUrl = `https://chat.myrecruiter.ai/Master_Function?action=get_config&t=${tenantHash}`;
   
   // Add fallback for resilience
   const fetchConfig = async () => {
     const urls = [
       `https://chat.myrecruiter.ai/Master_Function?action=get_config&t=${tenantHash}`,
       `https://chat.myrecruiter.ai/v1/widget/config/${tenantHash}`, // Legacy fallback
     ];
     
     for (const url of urls) {
       try {
         const response = await fetch(url);
         if (response.ok) return await response.json();
       } catch (e) {
         console.warn(`Config attempt failed: ${url}`);
       }
     }
     throw new Error('Config loading failed');
   };
   ```

3. **Update ChatProvider.jsx**:
   ```javascript
   // Chat endpoint with proper timeout
   const chatUrl = `https://chat.myrecruiter.ai/Master_Function?action=chat&t=${tenantHash}`;
   
   // 25-second timeout (Lambda has 30s limit)
   const controller = new AbortController();
   const timeoutId = setTimeout(() => controller.abort(), 25000);
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
// DYNAMIC VALUES FROM ENVIRONMENT.JS:
DEFAULT_TENANT_HASH = "my87674d777bf9" // MyRecruiter default tenant
CLOUDFRONT_URL = "https://your-actual-cloudfront.com"
API_GATEWAY_URL = "https://your-actual-api-gateway.com"
S3_BUCKET = "your-actual-bucket-name"

// TENANT DETECTION LOGIC:
// 1. URL parameter: ?tenant=HASH
// 2. Fallback: environment.js DEFAULT_TENANT_HASH
// 3. Methods: getTenantHashFromURL(), getDefaultTenantHash(), getTenantHash()
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

### Production Configuration Philosophy

**Defaults Over Configuration**: Picasso uses smart defaults in theme.css. Only configure what's different:
- ✅ Logo URL, tenant hash, custom messages
- ❌ Border radius, shadows, spacing (use CSS defaults)

**Lean Configs**: Foster Village's config is only 84 lines because it relies on defaults:
```json
{
  "tenant_hash": "HASH",
  "branding": {
    "primary_color": "#2db8be",  // Only what's different
    "logo_url": "..."            // Only what's needed
  }
  // Everything else uses theme.css defaults
}
```

### Lambda Architecture Plan

#### Phase 1: NEED IT NOW (Production 404 Fix)
- [x] Fix query parameter handling in Master_Function
- [x] Add CloudFront query string forwarding
- [x] Implement config loading fallbacks
- [x] Update deploy_tenant_stack with iframe-aware embed codes
- [ ] Deploy and verify with Foster Village

#### Phase 2: Stability (This Week)
- [ ] Fix session_utils.py tenant_id references
- [ ] Centralize CloudFront domain configuration
- [ ] Implement consistent error response format
- [ ] Set up CloudWatch alarms for 4xx/5xx

#### Phase 3: Simplification (Next Sprint)
Based on Master_Function analysis:
- [ ] Reduce tenant_config_loader.py from 535 to ~200 lines
- [ ] Extract shared constants to config module
- [ ] Simplify config loading logic (remove over-engineering)
- [ ] Consolidate error handling patterns

#### Phase 4: Optimization (Next Month)
- [ ] Add S3 connection pooling
- [ ] Implement config pre-loading for known tenants
- [ ] Move to Lambda@Edge for config serving
- [ ] Add config inheritance (base + tenant overrides)

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