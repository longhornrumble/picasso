# Bubble SSO Implementation Plan

## Overview

Enable single sign-on (SSO) between the Bubble-hosted MyRecruiter platform and the Picasso Analytics Dashboard. Users authenticate on Bubble and are seamlessly redirected to the analytics dashboard with a valid JWT token.

**Scope:** MVP implementation (Phases 1-2). Enhanced features deferred to post-launch.


**Estimated Effort:** 1 day

---

## Tech Lead Assessment

| Aspect | Status |
|--------|--------|
| Architectural Alignment | Excellent - matches existing JWT infrastructure |
| Frontend Code | Already complete - just needs configuration |
| Backend Code | No changes required |
| Risk Level | Low |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SSO FLOW                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐         ┌──────────────┐         ┌──────────────────────┐ │
│  │   Analytics  │         │    Bubble    │         │   AWS Secrets        │ │
│  │   Dashboard  │         │   Platform   │         │   Manager            │ │
│  └──────┬───────┘         └──────┬───────┘         └──────────┬───────────┘ │
│         │                        │                            │             │
│         │  1. Click "Sign in"    │                            │             │
│         │───────────────────────>│                            │             │
│         │  (redirect to Bubble)  │                            │             │
│         │                        │                            │             │
│         │                        │  2. User authenticates     │             │
│         │                        │     (email/password)       │             │
│         │                        │                            │             │
│         │                        │  3. Generate JWT           │             │
│         │                        │     (sign with HS256)      │             │
│         │                        │                            │             │
│         │  4. Redirect with JWT  │                            │             │
│         │<───────────────────────│                            │             │
│         │  ?token=eyJhbGc...     │                            │             │
│         │                        │                            │             │
│         │  5. Store token,       │                            │             │
│         │     fetch features     │                            │             │
│         │                        │                            │             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites (MUST Complete First)

### 1. Verify Tenant Hash Storage in Bubble

Bubble organization records MUST have the correct `tenant_hash` values:

| Tenant ID | Required tenant_hash |
|-----------|---------------------|
| MYR384719 | `my87674d777bf9` |
| AUS123957 | `auc5b0ecb0adcb` |
| FOS402334 | `fo85e6a06dcdf4` |

**Action:** Query Bubble database to confirm these values exist on Organization records.

### 2. Fetch Signing Key from AWS

```bash
AWS_PROFILE=chris-admin aws secretsmanager get-secret-value \
  --secret-id picasso/staging/jwt/signing-key \
  --region us-east-1 \
  --query 'SecretString' \
  --output text | python3 -c "import sys,json; print(json.load(sys.stdin)['signingKey'])"
```

**Action:** Store this value in Bubble environment variable (e.g., `JWT_SIGNING_KEY`).

### 3. Feature Flags Strategy

The analytics dashboard expects feature flags. Two options:

| Option | Approach | Recommendation |
|--------|----------|----------------|
| A | Include in JWT payload | More complex for Bubble |
| B | Rely on API `/features` endpoint | **Recommended** - simpler, already implemented |

**Decision:** Use Option B. Dashboard already calls `/features` endpoint after login to enrich user data.

---

## JWT Token Specification

### Token Structure

```json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "payload": {
    "tenant_id": "MYR384719",
    "tenant_hash": "my87674d777bf9",
    "email": "user@nonprofit.org",
    "name": "Jane Smith",
    "exp": 1735171200,
    "iat": 1735167600
  }
}
```

### Required Claims

| Claim | Type | Description | Source |
|-------|------|-------------|--------|
| `tenant_id` | string | Tenant identifier (e.g., "MYR384719") | Bubble User → Organization |
| `tenant_hash` | string | Hashed tenant ID for API queries | Bubble User → Organization |
| `email` | string | User's email address | Bubble User |
| `exp` | number | Expiration timestamp (Unix) | Current time + 8 hours |
| `iat` | number | Issued-at timestamp (Unix) | Current time |

### Optional Claims

| Claim | Type | Description |
|-------|------|-------------|
| `name` | string | User's display name |
| `user_id` | string | Bubble user unique ID |

### Token Lifetime

| Environment | TTL | Rationale |
|-------------|-----|-----------|
| Production | 8 hours | Full workday session |
| Development | 1 hour | Faster iteration |

---

## Phase 1: Bubble Configuration (MVP)

### 1.1 Create SSO Landing Page

**Page:** `/analytics-sso`

**Purpose:** Entry point for SSO flow - generates JWT and redirects to analytics.

**Workflow:**
```
On Page Load:
  IF Current User is logged in:
    1. Get user data (email, name)
    2. Get organization data (tenant_id, tenant_hash)
    3. Generate JWT (see 1.2)
    4. Redirect to: https://analytics.myrecruiter.ai?token={JWT}
  ELSE:
    Redirect to: /login?redirect=/analytics-sso
```

### 1.2 JWT Generation

#### Option A: Bubble JWT Plugin (Recommended)

1. Install **"JWT Token Generator"** plugin from Bubble marketplace
2. Configure with signing key from environment variable
3. Generate HS256-signed token with required claims

#### Option B: Lambda Helper (Alternative)

If Bubble plugin doesn't support HS256 properly, create a simple Lambda:

```python
# Lambda: generate_sso_token
import json
import hmac
import hashlib
import base64
import time
import boto3

def lambda_handler(event, context):
    body = json.loads(event['body'])

    # Fetch signing key
    secrets = boto3.client('secretsmanager', region_name='us-east-1')
    secret = secrets.get_secret_value(SecretId='picasso/staging/jwt/signing-key')
    signing_key = json.loads(secret['SecretString'])['signingKey']

    # Build payload
    payload = {
        "tenant_id": body['tenant_id'],
        "tenant_hash": body['tenant_hash'],
        "email": body['email'],
        "name": body.get('name', ''),
        "iat": int(time.time()),
        "exp": int(time.time()) + 28800  # 8 hours
    }

    # Generate JWT
    header = {"alg": "HS256", "typ": "JWT"}
    h = base64.urlsafe_b64encode(json.dumps(header).encode()).rstrip(b'=').decode()
    p = base64.urlsafe_b64encode(json.dumps(payload).encode()).rstrip(b'=').decode()
    sig = hmac.new(signing_key.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest()
    s = base64.urlsafe_b64encode(sig).rstrip(b'=').decode()

    return {
        'statusCode': 200,
        'body': json.dumps({'token': f"{h}.{p}.{s}"})
    }
```

Bubble calls: `POST https://api.myrecruiter.ai/auth/generate-sso-token`

### 1.3 Add Analytics Navigation Link

Add button/link in Bubble app navigation:

```
Button: "View Analytics Dashboard"
Action: Navigate to /analytics-sso
```

---

## Phase 2: Analytics Dashboard Configuration (MVP)

### 2.1 Environment Variables

**File:** `.env.production`

```env
# Bubble SSO Configuration
VITE_BUBBLE_AUTH_URL=https://myrecruiter.bubbleapps.io/analytics-sso

# Analytics API (existing - no change)
VITE_ANALYTICS_API_URL=https://uniywvlgstv2ymc46uyqs3z3du0vucst.lambda-url.us-east-1.on.aws
```

### 2.2 No Code Changes Required

The existing implementation already handles everything:

| Feature | File | Status |
|---------|------|--------|
| Token extraction from URL | `AuthContext.tsx:122-144` | Complete |
| JWT decoding | `AuthContext.tsx:26-37` | Complete |
| Expiry validation | `AuthContext.tsx:42-46` | Complete |
| localStorage persistence | `AuthContext.tsx:96-119` | Complete |
| Feature flag enrichment | `AuthContext.tsx:150-176` | Complete |
| Logout redirect | `AuthContext.tsx:197-213` | Complete |

### 2.3 Deploy

```bash
# Build with production env
npm run build

# Deploy to hosting (S3/CloudFront or similar)
aws s3 sync dist/ s3://picasso-analytics-dashboard/ --profile chris-admin
```

---

## MVP Implementation Checklist

### Prerequisites
- [ ] Verify Bubble organizations have correct `tenant_hash` values
- [ ] Fetch signing key from AWS Secrets Manager
- [ ] Add signing key to Bubble environment variable

### Phase 1: Bubble (~4 hours)
- [ ] Create `/analytics-sso` page
- [ ] Install JWT plugin OR deploy Lambda helper
- [ ] Configure JWT generation with required claims
- [ ] Test JWT generation (validate with jwt.io)
- [ ] Add "View Analytics" button to navigation

### Phase 2: Analytics (~30 minutes)
- [ ] Set `VITE_BUBBLE_AUTH_URL` in production environment
- [ ] Build and deploy updated frontend
- [ ] Test end-to-end SSO flow

### Validation (~30 minutes)
- [ ] User clicks "View Analytics" → Lands on dashboard with correct data
- [ ] Logout from dashboard → Returns to Bubble
- [ ] Token expiry → Re-login required
- [ ] Wrong/missing tenant_hash → Empty dashboard (data isolation working)

---

## Testing Plan

### Manual Test Cases (MVP)

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1 | Happy path | Click "View Analytics" on Bubble | Logged into dashboard, see data |
| 2 | Already on Bubble | Navigate to /analytics-sso directly | Redirected to analytics, logged in |
| 3 | Not logged in | Visit analytics, click "Sign in" | Redirect to Bubble login, then back |
| 4 | Token expired | Wait 8+ hours, refresh analytics | Redirected to login |
| 5 | Logout | Click logout in analytics | Returned to Bubble SSO page |

### Token Validation Test

```bash
# Generate test token and validate against API
TOKEN="eyJhbGc..."

curl -s "https://uniywvlgstv2ymc46uyqs3z3du0vucst.lambda-url.us-east-1.on.aws/forms/summary?range=7d" \
  -H "Authorization: Bearer $TOKEN"

# Should return data, not 401
```

---

## Security Notes

| Concern | Mitigation |
|---------|------------|
| Token theft | 8-hour TTL, HTTPS only |
| Signing key exposure | Stored in Bubble env var (not in code) |
| Cross-tenant access | `tenant_id` forced from JWT, validated by API |
| CORS | Already configured for analytics domain |

---

## Future Enhancements (Deferred)

These features are NOT part of MVP. Evaluate post-launch based on user feedback.

### Phase 3: Enhanced Logout (Low Priority)
- Create `/logout` page on Bubble that invalidates session
- Configure `VITE_BUBBLE_LOGOUT_URL` in analytics

### Phase 4: Deep Linking (Medium Priority)
- Preserve destination URL after login redirect
- Enable direct links like `/forms?range=30d`

### Phase 5: Silent Token Refresh (Low Priority)
- Iframe-based token refresh before expiry
- **Note:** High complexity, marginal UX gain. Users can re-login after 8 hours.

### Phase 6: Token Blacklist (Not Needed)
- For immediate token revocation on user deactivation
- **Note:** Overkill for analytics dashboard. 8-hour TTL is sufficient.

---

## Appendix: Manual JWT Generation (Development)

For testing without Bubble:

```bash
AWS_PROFILE=chris-admin python3 << 'EOF'
import json
import hmac
import hashlib
import base64
import time
import boto3

# Fetch signing key
secrets = boto3.client('secretsmanager', region_name='us-east-1')
secret = secrets.get_secret_value(SecretId='picasso/staging/jwt/signing-key')
signing_key = json.loads(secret['SecretString'])['signingKey']

# Token payload
payload = {
    "tenant_id": "MYR384719",
    "tenant_hash": "my87674d777bf9",
    "email": "developer@myrecruiter.ai",
    "name": "Developer",
    "iat": int(time.time()),
    "exp": int(time.time()) + 28800  # 8 hours
}

# Generate JWT
header = {"alg": "HS256", "typ": "JWT"}
h = base64.urlsafe_b64encode(json.dumps(header).encode()).rstrip(b'=').decode()
p = base64.urlsafe_b64encode(json.dumps(payload).encode()).rstrip(b'=').decode()
sig = hmac.new(signing_key.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest()
s = base64.urlsafe_b64encode(sig).rstrip(b'=').decode()

print(f"{h}.{p}.{s}")
EOF
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-28 | Claude | Initial draft |
| 1.1 | 2025-12-29 | Claude | Tech lead review - scoped to MVP, added prerequisites, deferred Phases 3-6 |
