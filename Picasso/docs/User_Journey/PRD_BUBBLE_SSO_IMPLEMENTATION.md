# PRD: Bubble SSO Implementation for Picasso Analytics Dashboard

**Document Version:** 1.0
**Date:** 2025-12-29
**Author:** Product Team
**Status:** Ready for Implementation

---

## 1. Executive Summary

This PRD defines the implementation of Single Sign-On (SSO) between Bubble (authentication layer) and the Picasso Analytics Dashboard (React application). The solution enables seamless authentication where Bubble acts exclusively as the auth provider at `login.myrecruiter.ai`, while the main product experience lives at `app.myrecruiter.ai`.

**Key Decision:** Bubble serves ONLY as authentication - users never spend time in Bubble itself. All product functionality remains in the React dashboard.

**Timeline:** 2-3 days implementation
**Priority:** High - Blocking production launch

---

## 2. Problem Statement

### Current State
- **Analytics Dashboard:** Has local authentication UI but no backend user management
- **Bubble:** Full authentication system (email/password, Google SSO) already built
- **Domain:** Both exist on `app.myrecruiter.ai` causing confusion

### Pain Points
1. Duplicate authentication logic across platforms
2. No unified user session management
3. Cannot leverage existing Bubble auth infrastructure
4. User confusion with conflicting login experiences
5. Manual tenant-to-user mapping overhead

### Target Users
- **Primary:** Institutional clients accessing analytics dashboards (e.g., MyRecruiter, Austin Angels, Foster Village)
- **Secondary:** System administrators managing multi-tenant access

---

## 3. Goals & Success Metrics

### Goals
1. Enable seamless SSO between Bubble auth and React dashboard
2. Maintain single source of truth for authentication (Bubble)
3. Preserve tenant isolation and data security
4. Minimize user friction during login/logout flows
5. Support 8-hour session persistence

### Success Metrics
| Metric | Target | Measurement |
|--------|--------|-------------|
| Auth success rate | >99% | Login attempts vs. successful dashboard loads |
| Session persistence | 8 hours | Token expiry validation |
| Redirect latency | <2 seconds | Time from Bubble auth to dashboard render |
| Token validation failures | <0.1% | API call rejections due to invalid JWT |
| User logout success | 100% | Clean token removal + redirect |

### Non-Goals
- Implementing role-based access control (RBAC) - handled by feature flags
- Multi-factor authentication (MFA) - may be added later
- Social login beyond existing Bubble Google SSO
- Password reset flows (already handled by Bubble)

---

## 4. User Stories

### Story 1: First-Time Visitor
**As a** new user visiting the analytics dashboard
**I want** to be automatically redirected to login
**So that** I can authenticate without seeing a broken/empty dashboard

**Acceptance Criteria:**
1. Visit `app.myrecruiter.ai` with no stored token
2. Immediately redirect to `login.myrecruiter.ai` (no intermediate page)
3. See Bubble login page with email/password and Google SSO options
4. After successful auth, return to `app.myrecruiter.ai?token=JWT`
5. Dashboard loads with correct tenant data

---

### Story 2: Authenticated User Returning
**As an** authenticated user returning to the dashboard
**I want** my session to persist
**So that** I don't need to re-login on every visit

**Acceptance Criteria:**
1. User authenticated within last 8 hours
2. Valid JWT stored in localStorage
3. Visit `app.myrecruiter.ai` directly
4. Dashboard loads immediately without redirect
5. User sees their tenant's analytics data

---

### Story 3: Expired Session
**As a** user whose session has expired
**I want** to be redirected to login automatically
**So that** I can re-authenticate without errors

**Acceptance Criteria:**
1. User has JWT older than 8 hours in localStorage
2. Visit `app.myrecruiter.ai`
3. System detects expired token
4. Auto-redirect to `login.myrecruiter.ai`
5. After re-auth, return to dashboard

---

### Story 4: User Logout
**As an** authenticated user
**I want** to sign out securely
**So that** no one else can access my session on shared devices

**Acceptance Criteria:**
1. Click "Sign Out" button in dashboard
2. JWT removed from localStorage
3. Redirect to `login.myrecruiter.ai`
4. Attempting to revisit `app.myrecruiter.ai` requires re-authentication

---

### Story 5: Multi-Tenant Isolation
**As a** tenant administrator
**I want** users to only see their organization's data
**So that** data privacy is maintained

**Acceptance Criteria:**
1. JWT includes correct `tenant_id` and `tenant_hash`
2. Dashboard loads data filtered by `tenant_hash`
3. API validates tenant_hash matches JWT claim
4. User cannot access data from other tenants

---

## 5. Technical Architecture

### Domain Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                    login.myrecruiter.ai                     │
│                   (Bubble - Auth Only)                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ • Email/Password Login                              │   │
│  │ • Google SSO                                        │   │
│  │ • Forgot Password                                   │   │
│  │ • JWT Generation on Success                         │   │
│  └─────────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────────┘
                       │ Redirect with JWT
                       │ ?token=eyJhbGc...
                       ↓
┌─────────────────────────────────────────────────────────────┐
│                     app.myrecruiter.ai                      │
│              (React Analytics Dashboard)                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ • Extract token from URL                            │   │
│  │ • Store in localStorage                             │   │
│  │ • Validate expiry                                   │   │
│  │ • Load tenant data                                  │   │
│  │ • Sign Out → Redirect to login.myrecruiter.ai       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Authentication Flow
```
User Journey:
1. app.myrecruiter.ai (no token)
   ↓
2. Check localStorage for JWT
   ↓ (not found or expired)
3. window.location.href = "https://login.myrecruiter.ai"
   ↓
4. User authenticates on Bubble
   ↓
5. Bubble generates JWT with claims
   ↓
6. Bubble redirects: "https://app.myrecruiter.ai?token=JWT"
   ↓
7. React extracts token, stores localStorage
   ↓
8. Dashboard renders with tenant data
```

### JWT Token Structure
```json
{
  "tenant_id": "MYR384719",
  "tenant_hash": "my87674d777bf9",
  "email": "user@example.com",
  "name": "John Doe",
  "exp": 1735516800,
  "iat": 1735488000
}
```

**Specification:**
- **Algorithm:** HS256 (HMAC-SHA256)
- **Signing Key:** Stored in AWS Secrets Manager at `picasso/staging/jwt/signing-key`
- **TTL:** 8 hours (28,800 seconds)
- **Encoding:** Base64URL

---

## 6. Detailed Requirements

### 6.1 DNS Configuration

**REQ-DNS-001:** Point `login.myrecruiter.ai` to Bubble hosting
**REQ-DNS-002:** Point `app.myrecruiter.ai` to React hosting (S3 + CloudFront)
**REQ-DNS-003:** Configure SSL/TLS certificates for both domains
**REQ-DNS-004:** Verify HTTPS-only access (no HTTP fallback)

---

### 6.2 Bubble Implementation

**REQ-BUB-001:** Update Bubble domain settings to `login.myrecruiter.ai`
**Validation:** Bubble admin panel shows correct custom domain

**REQ-BUB-002:** Retrieve JWT signing key from AWS Secrets Manager
**Details:**
- Secret name: `picasso/staging/jwt/signing-key`
- Region: us-east-1
- Access: Via IAM role or access keys

**REQ-BUB-003:** Store signing key in Bubble environment variable
**Variable Name:** `JWT_SIGNING_KEY`
**Scope:** Server-side only (never exposed to client)

**REQ-BUB-004:** Implement JWT generation workflow
**Trigger:** Successful user authentication
**Inputs:**
- User's email (from Bubble User object)
- User's Organization → tenant_id (e.g., "MYR384719")
- User's Organization → tenant_hash (e.g., "my87674d777bf9")

**REQ-BUB-005:** Generate JWT with required claims
**Required Claims:**
1. `tenant_id` (string)
2. `tenant_hash` (string)
3. `email` (string)
4. `exp` (number) = current Unix timestamp + 28800
5. `iat` (number) = current Unix timestamp

**Optional Claims:**
- `name` (string) - User's display name if available

**REQ-BUB-006:** Redirect to Analytics Dashboard with token
**Redirect URL:** `https://app.myrecruiter.ai?token=[JWT]`
**Method:** Server-side 302 redirect
**Validation:** Token appears in URL query string

**REQ-BUB-007:** Ensure Organization data model includes required fields
**Required Fields:**
- `tenant_id` (Text) - e.g., "MYR384719"
- `tenant_hash` (Text) - e.g., "my87674d777bf9"

**REQ-BUB-008:** Map existing test tenants to Organizations
**Test Data:**
| Organization | tenant_id | tenant_hash |
|--------------|-----------|-------------|
| MyRecruiter | MYR384719 | my87674d777bf9 |
| Austin Angels | AUS123957 | auc5b0ecb0adcb |
| Foster Village | FOS402334 | fo85e6a06dcdf4 |

---

### 6.3 Analytics Dashboard Implementation

**REQ-DASH-001:** Set environment variable for Bubble auth URL
**Variable:** `VITE_BUBBLE_AUTH_URL=https://login.myrecruiter.ai`
**Files:** `.env.staging`, `.env.production`

**REQ-DASH-002:** Remove intermediate Login page component
**Current State:** Login page with "Go to Bubble" button
**New State:** Auto-redirect logic in AuthContext

**REQ-DASH-003:** Implement auto-redirect when not authenticated
**Location:** `src/context/AuthContext.tsx`
**Logic:**
```typescript
useEffect(() => {
  const token = localStorage.getItem('auth_token');
  if (!token || isTokenExpired(token)) {
    window.location.href = import.meta.env.VITE_BUBBLE_AUTH_URL;
  }
}, []);
```

**REQ-DASH-004:** Extract token from URL on mount
**Status:** ✅ Already implemented (lines 122-144)
**Validation:** Confirm existing logic works correctly

**REQ-DASH-005:** Validate token expiry before use
**Status:** ✅ Already implemented (lines 42-46)
**Validation:** Test with expired token

**REQ-DASH-006:** Store token in localStorage
**Status:** ✅ Already implemented (lines 96-119)
**Key:** `auth_token`
**Validation:** Confirm persistence across page reloads

**REQ-DASH-007:** Decode JWT client-side (no verification)
**Status:** ✅ Already implemented (lines 26-37)
**Purpose:** Extract tenant_id, tenant_hash, email for UI display
**Note:** Server-side API validates signature

**REQ-DASH-008:** Implement logout with redirect
**Status:** ✅ Already implemented (lines 197-213)
**Actions:**
1. Remove token from localStorage
2. Clear React state
3. Redirect to VITE_BUBBLE_AUTH_URL

**REQ-DASH-009:** Build and deploy to app.myrecruiter.ai
**Build Command:** `npm run build:production`
**Deployment Target:** S3 bucket with CloudFront distribution
**Environment:** Production

---

### 6.4 Security Requirements

**REQ-SEC-001:** JWT signing key MUST NOT be committed to code
**Enforcement:** AWS Secrets Manager + Bubble env vars only

**REQ-SEC-002:** All domains MUST use HTTPS
**Validation:** SSL Labs scan for both domains

**REQ-SEC-003:** Token TTL set to 8 hours (production)
**Justification:** Balance between security and user convenience

**REQ-SEC-004:** localStorage access limited to same-origin
**Validation:** Browser security model enforces this

**REQ-SEC-005:** Backend API MUST validate JWT signature
**Location:** Master_Function_Staging Lambda
**Method:** Decode with same signing key from AWS Secrets Manager

**REQ-SEC-006:** Tenant isolation enforced by tenant_hash
**Validation:** API filters DynamoDB queries by tenant_hash claim

**REQ-SEC-007:** No sensitive data in JWT payload
**Allowed:** tenant_id, tenant_hash, email, name
**Forbidden:** Passwords, API keys, PII beyond email

---

## 7. Implementation Plan

### Phase 1: Infrastructure Setup (Day 1 - Morning)
**Owner:** DevOps

1. **DNS Configuration**
   - [ ] Create CNAME for `login.myrecruiter.ai` → Bubble
   - [ ] Create CNAME for `app.myrecruiter.ai` → CloudFront
   - [ ] Request/apply SSL certificates
   - [ ] Verify DNS propagation

2. **AWS Secrets Manager**
   - [ ] Generate secure random signing key (256-bit)
   - [ ] Store in `picasso/staging/jwt/signing-key`
   - [ ] Document access permissions

**Deliverable:** Both domains accessible via HTTPS

---

### Phase 2: Bubble Implementation (Day 1 - Afternoon)
**Owner:** Bubble Developer

1. **Domain Setup**
   - [ ] Update Bubble app domain to `login.myrecruiter.ai`
   - [ ] Test authentication page loads correctly

2. **Environment Configuration**
   - [ ] Add `JWT_SIGNING_KEY` environment variable in Bubble
   - [ ] Retrieve value from AWS Secrets Manager
   - [ ] Verify variable accessible in workflows

3. **JWT Generation Workflow**
   - [ ] Install/configure JWT plugin in Bubble (if needed)
   - [ ] Create workflow triggered on login success
   - [ ] Map User → Organization fields (tenant_id, tenant_hash)
   - [ ] Generate JWT with required claims
   - [ ] Test JWT structure matches specification

4. **Redirect Logic**
   - [ ] Add redirect action to workflow
   - [ ] Set destination: `https://app.myrecruiter.ai?token=[JWT]`
   - [ ] Test redirect preserves token parameter

**Deliverable:** Functional JWT generation + redirect

---

### Phase 3: Analytics Dashboard Updates (Day 2 - Morning)
**Owner:** Frontend Developer

1. **Environment Configuration**
   - [ ] Add `VITE_BUBBLE_AUTH_URL` to `.env.staging`
   - [ ] Add `VITE_BUBBLE_AUTH_URL` to `.env.production`
   - [ ] Verify build process includes variable

2. **AuthContext Modifications**
   - [ ] Remove Login page component (or make unreachable)
   - [ ] Add auto-redirect logic for unauthenticated users
   - [ ] Test existing token extraction (REQ-DASH-004)
   - [ ] Test existing expiry validation (REQ-DASH-005)
   - [ ] Test existing logout flow (REQ-DASH-008)

3. **Build & Deploy**
   - [ ] Run `npm run build:production`
   - [ ] Upload to S3 bucket
   - [ ] Invalidate CloudFront cache
   - [ ] Verify deployment at `app.myrecruiter.ai`

**Deliverable:** Dashboard deployed with SSO integration

---

### Phase 4: End-to-End Testing (Day 2 - Afternoon)
**Owner:** QA + Product

Execute test scenarios from Section 9 (Testing & Validation)

**Deliverable:** All acceptance criteria validated

---

### Phase 5: Production Rollout (Day 3)
**Owner:** Product + DevOps

1. **Pre-Launch Checklist**
   - [ ] All DNS records propagated
   - [ ] SSL certificates valid
   - [ ] JWT signing key secured in Secrets Manager
   - [ ] Bubble domain configured
   - [ ] Analytics dashboard deployed
   - [ ] Test users mapped to Organizations

2. **Rollout**
   - [ ] Enable SSO for pilot users (1-2 tenants)
   - [ ] Monitor logs for auth failures
   - [ ] Validate session persistence
   - [ ] Full rollout to remaining tenants

3. **Post-Launch Monitoring**
   - [ ] Track auth success rate (target >99%)
   - [ ] Monitor token expiry patterns
   - [ ] Check for JWT validation errors in API logs

**Deliverable:** SSO live in production

---

## 8. Security Considerations

### Threat Model

**Threat 1: JWT Signing Key Exposure**
- **Risk:** Attacker obtains signing key → Can forge tokens for any tenant
- **Mitigation:**
  - Store key in AWS Secrets Manager (encrypted at rest)
  - Bubble env var server-side only (never exposed to client)
  - Rotate key quarterly (with dual-key transition period)
  - Monitor AWS CloudTrail for secret access

**Threat 2: Token Interception**
- **Risk:** Man-in-the-middle attack captures JWT during redirect
- **Mitigation:**
  - HTTPS-only for all domains (TLS 1.2+)
  - HTTP Strict Transport Security (HSTS) headers
  - Short token TTL (8 hours)

**Threat 3: XSS Attack Stealing Token**
- **Risk:** Malicious script reads localStorage → Steals JWT
- **Mitigation:**
  - Content Security Policy (CSP) headers
  - DOMPurify sanitization (already implemented in Picasso)
  - Regular security audits of third-party dependencies

**Threat 4: Tenant Isolation Breach**
- **Risk:** User modifies JWT to access another tenant's data
- **Mitigation:**
  - Backend validates JWT signature (cannot forge without key)
  - API enforces tenant_hash filtering on all queries
  - Audit logs track data access by tenant

**Threat 5: Expired Token Replay**
- **Risk:** Attacker reuses old JWT after expiry
- **Mitigation:**
  - Backend checks `exp` claim before processing
  - Frontend validates expiry before API calls
  - No grace period for expired tokens

---

### Security Controls Checklist

- [x] JWT signed with HS256 algorithm
- [x] Signing key stored in AWS Secrets Manager
- [x] Signing key never committed to code
- [x] Token TTL set to 8 hours
- [x] HTTPS enforced on all domains
- [x] Backend validates JWT signature
- [x] Backend validates token expiry
- [x] Tenant isolation via tenant_hash claim
- [x] No sensitive data in JWT payload
- [ ] Content Security Policy headers configured
- [ ] HSTS headers enabled
- [ ] Regular key rotation schedule (quarterly)

---

## 9. Testing & Validation

### Test Scenario 1: First-Time User (Unauthenticated)
**Steps:**
1. Clear browser localStorage
2. Visit `https://app.myrecruiter.ai`
3. Observe immediate redirect to `https://login.myrecruiter.ai`
4. Enter test credentials (email/password)
5. Observe redirect back to `https://app.myrecruiter.ai?token=...`
6. Verify dashboard loads with correct tenant data

**Acceptance Criteria:**
- ✅ No intermediate login page shown in React app
- ✅ Redirect latency <2 seconds
- ✅ Token present in URL after Bubble auth
- ✅ Dashboard shows tenant-specific analytics

---

### Test Scenario 2: Returning User (Valid Session)
**Steps:**
1. Authenticate per Scenario 1
2. Close browser tab
3. Reopen browser and visit `https://app.myrecruiter.ai`
4. Verify dashboard loads immediately (no redirect)

**Acceptance Criteria:**
- ✅ No redirect to Bubble login
- ✅ Token retrieved from localStorage
- ✅ Dashboard renders within 2 seconds
- ✅ User sees same tenant data as before

---

### Test Scenario 3: Expired Token
**Steps:**
1. Authenticate and obtain JWT
2. Manually edit localStorage to set `exp` claim to past timestamp
3. Refresh `https://app.myrecruiter.ai`
4. Observe redirect to `https://login.myrecruiter.ai`
5. Re-authenticate
6. Verify dashboard loads with new token

**Acceptance Criteria:**
- ✅ Expired token detected by frontend
- ✅ Auto-redirect to Bubble login
- ✅ New token generated with fresh expiry
- ✅ Dashboard loads successfully

---

### Test Scenario 4: User Logout
**Steps:**
1. Authenticate and load dashboard
2. Click "Sign Out" button
3. Observe redirect to `https://login.myrecruiter.ai`
4. Attempt to visit `https://app.myrecruiter.ai` directly
5. Verify redirect to login (token cleared)

**Acceptance Criteria:**
- ✅ Token removed from localStorage
- ✅ Redirect to Bubble login successful
- ✅ Cannot access dashboard without re-auth

---

### Test Scenario 5: Multi-Tenant Isolation
**Setup:** Create test users for two different tenants

**Steps:**
1. Authenticate as User A (tenant MYR384719)
2. Note dashboard shows MyRecruiter data
3. Log out
4. Authenticate as User B (tenant AUS123957)
5. Verify dashboard shows Austin Angels data (NOT MyRecruiter)
6. Decode both JWTs and confirm different `tenant_hash` values

**Acceptance Criteria:**
- ✅ Each user sees only their tenant's data
- ✅ JWT contains correct tenant_id and tenant_hash
- ✅ API filters data by tenant_hash
- ✅ No cross-tenant data leakage

---

### Test Scenario 6: Invalid/Malformed Token
**Steps:**
1. Manually set localStorage `auth_token` to invalid value (e.g., "invalid_token")
2. Visit `https://app.myrecruiter.ai`
3. Observe redirect to login

**Acceptance Criteria:**
- ✅ Frontend detects malformed JWT
- ✅ Auto-redirect to Bubble login
- ✅ No error displayed to user

---

### Test Scenario 7: JWT Structure Validation
**Steps:**
1. Authenticate and capture JWT from URL
2. Decode JWT using jwt.io
3. Verify claims match specification

**Acceptance Criteria:**
- ✅ Header contains `"alg": "HS256"`
- ✅ Payload contains `tenant_id`, `tenant_hash`, `email`, `exp`, `iat`
- ✅ `exp` = `iat` + 28800 (8 hours)
- ✅ Signature verifiable with signing key

---

### Test Scenario 8: Google SSO Login
**Steps:**
1. Visit `https://login.myrecruiter.ai`
2. Click "Sign in with Google"
3. Complete Google OAuth flow
4. Observe redirect to `https://app.myrecruiter.ai?token=...`
5. Verify dashboard loads

**Acceptance Criteria:**
- ✅ Google SSO flow completes successfully
- ✅ JWT generated with Google account email
- ✅ Redirect to dashboard with token
- ✅ Dashboard loads with correct tenant data

---

### Performance Testing

**Test:** Auth Flow Latency
- **Metric:** Time from Bubble auth success to dashboard render
- **Target:** <3 seconds (95th percentile)
- **Method:** Browser DevTools Performance tab

**Test:** Token Validation Overhead
- **Metric:** API response time with JWT validation
- **Target:** <50ms overhead vs. no-auth baseline
- **Method:** API Gateway/Lambda CloudWatch metrics

---

## 10. Rollout Plan

### Pre-Rollout Checklist
- [ ] All implementation tasks complete (Section 7)
- [ ] All test scenarios passed (Section 9)
- [ ] Security audit complete (Section 8)
- [ ] Documentation updated (README, runbooks)
- [ ] Rollback plan documented
- [ ] Support team briefed on SSO flows

---

### Rollout Phases

#### Phase 0: Pre-Production Validation (Day 1-2)
**Environment:** Staging
**Users:** Internal team only
**Duration:** 1-2 days

**Activities:**
1. Deploy Bubble to `login-staging.myrecruiter.ai`
2. Deploy React to `app-staging.myrecruiter.ai`
3. Run all test scenarios
4. Fix any issues found

**Success Criteria:**
- All test scenarios pass
- No critical bugs identified
- Performance targets met

---

#### Phase 1: Pilot Launch (Day 3)
**Environment:** Production
**Users:** 1-2 friendly tenants (e.g., MyRecruiter internal team)
**Duration:** 1 day

**Activities:**
1. Deploy Bubble to `login.myrecruiter.ai`
2. Deploy React to `app.myrecruiter.ai`
3. Enable SSO for pilot tenant(s)
4. Monitor auth logs, error rates, user feedback

**Success Metrics:**
- Auth success rate >99%
- Zero critical bugs
- Positive user feedback

**Rollback Trigger:**
- Auth success rate <95%
- Data access errors
- Security vulnerability discovered

---

#### Phase 2: Full Rollout (Day 4-5)
**Environment:** Production
**Users:** All tenants
**Duration:** 1-2 days

**Activities:**
1. Enable SSO for remaining tenants
2. Monitor CloudWatch metrics (auth rate, API errors)
3. Track support tickets related to login issues
4. Validate session persistence across user base

**Success Metrics:**
- Auth success rate >99%
- <5 support tickets per 100 users
- Average session duration ≥4 hours

---

### Rollback Plan

**Trigger Conditions:**
- Auth success rate drops below 90%
- Critical security vulnerability discovered
- Data isolation breach detected
- Widespread user complaints

**Rollback Steps:**
1. Revert DNS for `app.myrecruiter.ai` to previous hosting
2. Restore previous React build from S3 versioning
3. Disable Bubble redirect workflow (serve login locally)
4. Notify users via email/banner of temporary revert
5. Schedule post-mortem to address root cause

**Recovery Time Objective (RTO):** <30 minutes
**Recovery Point Objective (RPO):** Zero data loss (auth state in localStorage)

---

## 11. Appendix

### A. JWT Generation Code Sample (Bubble Workflow Pseudocode)

```javascript
// Bubble Backend Workflow: On User Login Success

// Step 1: Get user and organization data
const user = Current_User;
const org = user.Organization;

// Step 2: Build JWT payload
const payload = {
  tenant_id: org.tenant_id,        // e.g., "MYR384719"
  tenant_hash: org.tenant_hash,    // e.g., "my87674d777bf9"
  email: user.email,               // e.g., "user@example.com"
  name: user.name,                 // Optional
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 28800  // 8 hours
};

// Step 3: Sign JWT with HS256
const signingKey = Server_Environment.JWT_SIGNING_KEY;
const jwt = jwt_encode(payload, signingKey, 'HS256');

// Step 4: Redirect to Analytics Dashboard
const redirectUrl = `https://app.myrecruiter.ai?token=${jwt}`;
Navigate_External(redirectUrl);
```

---

### B. React AuthContext Auto-Redirect Logic

```typescript
// src/context/AuthContext.tsx

useEffect(() => {
  // Extract token from URL if present
  const urlParams = new URLSearchParams(window.location.search);
  const tokenFromUrl = urlParams.get('token');

  if (tokenFromUrl) {
    // Store token and remove from URL
    localStorage.setItem('auth_token', tokenFromUrl);
    window.history.replaceState({}, '', window.location.pathname);
    setToken(tokenFromUrl);
    return;
  }

  // Check for existing token
  const storedToken = localStorage.getItem('auth_token');

  if (!storedToken || isTokenExpired(storedToken)) {
    // No valid token - redirect to Bubble login
    const bubbleAuthUrl = import.meta.env.VITE_BUBBLE_AUTH_URL;
    window.location.href = bubbleAuthUrl;
    return;
  }

  // Valid token exists - set in state
  setToken(storedToken);
}, []);
```

---

### C. JWT Expiry Validation Helper

```typescript
// src/context/AuthContext.tsx

const isTokenExpired = (token: string): boolean => {
  try {
    const decoded = jwtDecode<JWTPayload>(token);
    const currentTime = Math.floor(Date.now() / 1000);
    return decoded.exp < currentTime;
  } catch (error) {
    // Malformed token - treat as expired
    return true;
  }
};
```

---

### D. Backend JWT Validation (Python Lambda)

```python
# Lambdas/lambda/Master_Function_Staging/lambda_function.py

import jwt
import boto3
import json
from datetime import datetime

def validate_jwt(token):
    """
    Validate JWT signature and expiry.
    Returns decoded payload if valid, raises exception if invalid.
    """
    # Retrieve signing key from Secrets Manager
    secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
    response = secrets_client.get_secret_value(
        SecretId='picasso/staging/jwt/signing-key'
    )
    signing_key = json.loads(response['SecretString'])['key']

    try:
        # Decode and validate
        payload = jwt.decode(
            token,
            signing_key,
            algorithms=['HS256'],
            options={"verify_exp": True}
        )

        # Verify required claims exist
        required_claims = ['tenant_id', 'tenant_hash', 'email', 'exp', 'iat']
        for claim in required_claims:
            if claim not in payload:
                raise ValueError(f"Missing required claim: {claim}")

        return payload

    except jwt.ExpiredSignatureError:
        raise ValueError("Token has expired")
    except jwt.InvalidTokenError as e:
        raise ValueError(f"Invalid token: {str(e)}")
```

---

### E. Environment Variables Reference

#### Analytics Dashboard (.env.production)
```bash
# Bubble Auth URL
VITE_BUBBLE_AUTH_URL=https://login.myrecruiter.ai

# API Endpoints (existing)
VITE_API_GATEWAY_URL=https://api.myrecruiter.ai/staging
VITE_WEBSOCKET_URL=wss://api.myrecruiter.ai/staging
```

#### Bubble Environment Variables
```bash
# JWT Signing Key (server-side only)
JWT_SIGNING_KEY=<retrieve from AWS Secrets Manager>

# Analytics Redirect URL
ANALYTICS_DASHBOARD_URL=https://app.myrecruiter.ai
```

#### AWS Secrets Manager
```json
{
  "SecretId": "picasso/staging/jwt/signing-key",
  "SecretString": {
    "key": "<256-bit random string, base64 encoded>"
  }
}
```

---

### F. Test User Accounts

| Email | Organization | tenant_id | tenant_hash | Password |
|-------|-------------|-----------|-------------|----------|
| test@myrecruiter.ai | MyRecruiter | MYR384719 | my87674d777bf9 | [Set in Bubble] |
| test@austinangels.com | Austin Angels | AUS123957 | auc5b0ecb0adcb | [Set in Bubble] |
| test@fostervillage.org | Foster Village | FOS402334 | fo85e6a06dcdf4 | [Set in Bubble] |

---

### G. Monitoring & Alerting

**CloudWatch Metrics to Track:**
- Lambda invocation errors (JWT validation failures)
- API Gateway 4xx/5xx response rates
- Average auth flow latency (Bubble → Dashboard render)

**CloudWatch Alarms:**
- Alert if JWT validation error rate >1% over 5 minutes
- Alert if API Gateway 5xx rate >0.5% over 5 minutes
- Alert if no successful logins for >15 minutes (production hours)

**Log Queries (CloudWatch Insights):**
```
# Track JWT validation failures
fields @timestamp, @message
| filter @message like /JWT validation failed/
| sort @timestamp desc
| limit 100

# Track auth success rate
fields @timestamp, @message
| filter @message like /User authenticated/ or @message like /Auth failed/
| stats count(*) as total,
        sum(@message like /User authenticated/) as success,
        sum(@message like /Auth failed/) as failures
| extend success_rate = (success / total) * 100
```

---

### H. Support Runbook: SSO Troubleshooting

**Issue 1: User stuck in redirect loop**
- **Symptom:** Redirect between app.myrecruiter.ai and login.myrecruiter.ai
- **Diagnosis:** Bubble failing to generate JWT or redirect malformed
- **Steps:**
  1. Check Bubble workflow logs for errors
  2. Verify `JWT_SIGNING_KEY` env var set correctly
  3. Test JWT generation with known user
  4. Check CloudWatch for Lambda validation errors

**Issue 2: "Invalid token" error on dashboard**
- **Symptom:** User redirected to login despite authenticating
- **Diagnosis:** JWT signature validation failing
- **Steps:**
  1. Decode JWT with jwt.io - check structure
  2. Verify signing key matches between Bubble and Lambda
  3. Check Lambda logs for specific validation error
  4. Verify `exp` claim not in past

**Issue 3: User sees wrong tenant's data**
- **Symptom:** Dashboard shows data from different organization
- **Diagnosis:** Incorrect tenant_hash in JWT or API filtering broken
- **Steps:**
  1. Decode user's JWT - verify `tenant_hash` correct
  2. Check Bubble User → Organization mapping
  3. Test API query with tenant_hash parameter
  4. Review audit logs for data access patterns

---

### I. Related Documentation

- **Bubble SSO Implementation Plan:** `/Users/chrismiller/Desktop/Working_Folder/Picasso/docs/User_Journey/SSO_IMPLEMENTATION_PLAN.md`
- **Analytics Architecture:** `/Users/chrismiller/Desktop/Working_Folder/Picasso/docs/User_Journey/PICASSO_ANALYTICS_ARCHITECTURE.md`
- **Security Audit:** `/Users/chrismiller/Desktop/Working_Folder/SECURITY_AUDIT_EXECUTIVE_SUMMARY.md`
- **AuthContext Source:** `/Users/chrismiller/Desktop/Working_Folder/picasso-analytics-dashboard/src/context/AuthContext.tsx`

---

### J. Glossary

| Term | Definition |
|------|------------|
| **SSO** | Single Sign-On - authentication system allowing one login for multiple services |
| **JWT** | JSON Web Token - compact, URL-safe token format for securely transmitting claims |
| **HS256** | HMAC-SHA256 - symmetric signing algorithm using shared secret |
| **tenant_id** | Human-readable tenant identifier (e.g., "MYR384719") |
| **tenant_hash** | Hashed tenant identifier for API queries (e.g., "my87674d777bf9") |
| **exp** | Expiration timestamp claim in JWT (Unix epoch seconds) |
| **iat** | Issued-at timestamp claim in JWT (Unix epoch seconds) |
| **TTL** | Time-To-Live - duration before token expires (8 hours for this implementation) |

---

## Document Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-29 | Product Team | Initial PRD based on agreed requirements |

---

**Next Steps:**
1. Review and approve this PRD with stakeholders
2. Create implementation tickets in project management tool
3. Assign owners for each phase (Section 7)
4. Schedule kickoff meeting for Day 1
5. Begin Phase 1: Infrastructure Setup

**Questions or Feedback:** Contact Product Team
