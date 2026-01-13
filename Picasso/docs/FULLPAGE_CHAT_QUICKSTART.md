# Fullpage Chat Links - Quickstart Guide

Fullpage chat links provide a standalone, fullscreen chat experience for social media profiles (Instagram, Facebook, Linktree, etc.).

## URL Format

```
https://chat.myrecruiter.ai/go/index.html?t=TENANT_HASH
```

**That's it.** No deployment needed - just construct the URL with the tenant's hash.

## Finding the Tenant Hash

**Known tenants:**
| Tenant | Hash | Fullpage URL |
|--------|------|--------------|
| Austin Angels | `auc5b0ecb0adcb` | [Link](https://chat.myrecruiter.ai/go/index.html?t=auc5b0ecb0adcb) |
| Foster Village | `fo85e6a06dcdf4` | [Link](https://chat.myrecruiter.ai/go/index.html?t=fo85e6a06dcdf4) |
| MyRecruiter | `my87674d777bf9` | [Link](https://chat.myrecruiter.ai/go/index.html?t=my87674d777bf9) |

**For other tenants**, find the hash in:
```bash
aws s3 cp s3://myrecruiter-picasso/tenant-mappings.json - --profile chris-admin | python3 -m json.tool
```

Or from the tenant config:
```bash
aws s3 cp s3://myrecruiter-picasso/tenants/{TENANT_ID}/{TENANT_ID}-config.json - --profile chris-admin | grep tenant_hash
```

## Testing

1. Open the URL in browser
2. Chat should open fullscreen immediately
3. Verify correct branding and action chips

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Chat Not Available" | Verify tenant hash is correct |
| Wrong branding | Check you have the right tenant hash |
| Shows as widget (not fullscreen) | Use `/go/index.html` not `/iframe.html` |
