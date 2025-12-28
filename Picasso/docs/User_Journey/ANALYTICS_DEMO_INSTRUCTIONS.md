# Analytics Demo Instructions

How to enable mock data for sales demos using the demo tenant (MYR384719).

---

## Overview

The analytics dashboard supports a **demo mode** that shows curated mock data instead of live API data. This is useful for:
- Sales presentations
- Training sessions
- Screenshots and marketing materials

**Important:** Mock data is strictly tied to tenant `MYR384719` and will NOT affect any other tenant.

---

## Prerequisites

1. Access to the analytics dashboard deployment environment
2. A valid JWT token for the demo tenant (MYR384719)

---

## Step 1: Set Environment Variable

The mock data feature is controlled by the `VITE_USE_MOCK_DATA` environment variable.

### Local Development

Edit the `.env` file in the `picasso-analytics-dashboard` directory:

```bash
# picasso-analytics-dashboard/.env
VITE_USE_MOCK_DATA=true
```

Then restart the dev server:

```bash
npm run dev
```

### Production/Staging Deployment

Set the environment variable in your deployment configuration:

**Vercel:**
```
Settings → Environment Variables → Add:
Name: VITE_USE_MOCK_DATA
Value: true
```

**AWS Amplify:**
```
App settings → Environment variables → Add:
VITE_USE_MOCK_DATA = true
```

**Manual Build:**
```bash
VITE_USE_MOCK_DATA=true npm run build
```

---

## Step 2: Log In as Demo Tenant

Generate a JWT token for the demo tenant using this script:

```bash
AWS_PROFILE=chris-admin python3 << 'EOF'
import json
import hmac
import hashlib
import base64
import time
import boto3

# Get signing key from Secrets Manager
secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
secret = secrets_client.get_secret_value(SecretId='picasso/staging/jwt/signing-key')
secret_data = json.loads(secret['SecretString'])
signing_key = secret_data['signingKey']

# Demo tenant credentials
payload = {
    "tenant_id": "MYR384719",           # Demo tenant ID - REQUIRED
    "tenant_hash": "my87674d777bf9",    # Demo tenant hash
    "email": "demo@myrecruiter.ai",
    "exp": int(time.time()) + 3600      # 1 hour expiry
}

# Create JWT
header = {"alg": "HS256", "typ": "JWT"}
header_b64 = base64.urlsafe_b64encode(json.dumps(header).encode()).rstrip(b'=').decode()
payload_b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).rstrip(b'=').decode()
message = f"{header_b64}.{payload_b64}"
signature = hmac.new(signing_key.encode(), message.encode(), hashlib.sha256).digest()
signature_b64 = base64.urlsafe_b64encode(signature).rstrip(b'=').decode()
token = f"{message}.{signature_b64}"

print(token)
EOF
```

Then log in:
1. Navigate to the analytics dashboard
2. Click "Enter Token Manually"
3. Paste the generated JWT token
4. Click "Sign In"

---

## Step 3: Verify Mock Data is Active

Once logged in as tenant MYR384719 with the env var enabled, you should see:

### Forms Dashboard
| Metric | Mock Value |
|--------|------------|
| Form Views | 1,240 |
| Completions | 521 |
| Abandon Rate | 57.9% |
| Top Bottleneck | Background Check Consent (38%) |

### Conversations Dashboard
| Metric | Mock Value |
|--------|------------|
| Total Conversations | 276 |
| Total Messages | 285 |
| Response Time | 2.1 sec |
| After Hours | 49.5% |
| Peak Time | Thursday at 12PM |

---

## Security Safeguards

The mock data system has built-in protection to prevent accidental exposure to real tenants:

```typescript
// Mock data requires BOTH conditions:
const DEMO_TENANT_ID = 'MYR384719';
const MOCK_DATA_ENV_ENABLED = import.meta.env.VITE_USE_MOCK_DATA === 'true';

function shouldUseMockData(tenantId: string | undefined): boolean {
  return MOCK_DATA_ENV_ENABLED && tenantId === DEMO_TENANT_ID;
}
```

**This means:**
- Setting `VITE_USE_MOCK_DATA=true` alone does NOTHING for other tenants
- Other tenants will always see their real data from the API
- Only `MYR384719` can ever see mock data
- If you log in as a different tenant, you'll see live data

---

## Disabling Mock Data

To return to live data mode:

### Option 1: Change Environment Variable
```bash
# .env
VITE_USE_MOCK_DATA=false
```
Or simply remove the line.

### Option 2: Log In as Different Tenant
Even with `VITE_USE_MOCK_DATA=true`, logging in as any tenant other than MYR384719 will show live data.

---

## Troubleshooting

### Mock data not showing for MYR384719

1. **Check env var is set:**
   ```bash
   echo $VITE_USE_MOCK_DATA  # Should print "true"
   ```

2. **Rebuild if needed:**
   ```bash
   npm run build
   ```

3. **Verify tenant ID in JWT:**
   - Decode your JWT at https://jwt.io
   - Confirm `tenant_id` is exactly `MYR384719`

### Real tenant accidentally seeing mock data

This should be impossible due to the tenant check, but if it occurs:

1. Verify the tenant_id in the JWT token
2. Check that `shouldUseMockData()` function hasn't been modified
3. Review recent code changes to Dashboard.tsx and ConversationsDashboard.tsx

---

## File Locations

| File | Purpose |
|------|---------|
| `src/pages/Dashboard.tsx` | Forms dashboard mock data logic |
| `src/pages/ConversationsDashboard.tsx` | Conversations dashboard mock data logic |
| `.env` | Environment variable configuration |
| `CLAUDE.md` | Full documentation including JWT generation |

---

## Demo Tenant Details

| Field | Value |
|-------|-------|
| Tenant ID | `MYR384719` |
| Tenant Hash | `my87674d777bf9` |
| Name | MyRecruiter (Demo) |

---

*Last updated: 2025-12-28*
