# Migration Guide: v1.3 → v1.4.1 (Action Chips Explicit Routing)

**Version**: 1.0
**Date**: 2025-10-30
**Target Audience**: Operations team
**Estimated Time**: 15-30 minutes per tenant

---

## Executive Summary

### What's Changing

v1.4.1 introduces **explicit routing** for action chips, eliminating unreliable keyword matching:

**Before (v1.3)**:
- Action chips → keyword matching → conversation branches
- Unpredictable routing behavior
- High maintenance burden

**After (v1.4.1)**:
- Action chips → explicit `target_branch` → conversation branches
- Predictable routing behavior
- Zero keyword maintenance

### Benefits

1. **Predictable routing**: Explicit `target_branch` replaces keyword guessing
2. **Zero keyword maintenance**: No more updating keywords when content changes
3. **Fallback navigation hub**: Users never hit dead ends
4. **Better user experience**: 25%+ CTA click-through improvement (target)

### Migration Strategy

1. **Automatic transformation**: Lambda converts action chips array → dictionary with IDs
2. **Manual configuration**: Operations team links chips to branches in Config Builder
3. **Zero downtime**: v1.3 configs continue working during transition

---

## Pre-Migration Checklist

Before starting migration, verify:

- [ ] Tenant has existing v1.3 config in S3
- [ ] Backup of tenant config created
- [ ] Operations team has access to Config Builder (future)
- [ ] Tenant has at least one conversation branch with CTAs
- [ ] Time allocated: 15-30 minutes

---

## Migration Phases

### Phase 1: Automatic Transformation (Already Complete)

**Status**: ✅ Implemented in `deploy_tenant_stack` Lambda

The Lambda automatically:
1. Detects action chips in array format
2. Generates unique IDs via slugification
3. Transforms to dictionary format
4. Sets `target_branch: null` (ready for manual linking)

**Example Transformation**:

```json
// BEFORE (v1.3 - from Bubble)
{
  "action_chips": {
    "enabled": true,
    "default_chips": [
      {"label": "Volunteer", "value": "Tell me about volunteering"},
      {"label": "Donate", "value": "How can I donate?"}
    ]
  }
}

// AFTER (v1.4.1 - in S3 config)
{
  "action_chips": {
    "enabled": true,
    "default_chips": {
      "volunteer": {
        "id": "volunteer",
        "label": "Volunteer",
        "value": "Tell me about volunteering",
        "target_branch": null  // Ready for manual linking
      },
      "donate": {
        "id": "donate",
        "label": "Donate",
        "value": "How can I donate?",
        "target_branch": null
      }
    }
  }
}
```

### Phase 2: Manual Configuration (Config Builder - Future)

**Status**: ⏳ Config Builder UI coming in Sprint 2

Operations team will:
1. Log into Config Builder web console
2. Navigate to "Action Chips" section
3. For each chip, select `target_branch` from dropdown
4. Configure `fallback_branch` in "CTA Settings"
5. Save and deploy updated config

**Example Configuration**:

```json
{
  "action_chips": {
    "enabled": true,
    "default_chips": {
      "volunteer": {
        "id": "volunteer",
        "label": "Volunteer",
        "value": "Tell me about volunteering",
        "target_branch": "volunteer_interest"  // ✅ Linked to branch
      },
      "donate": {
        "id": "donate",
        "label": "Donate",
        "value": "How can I donate?",
        "target_branch": "donation_interest"  // ✅ Linked to branch
      }
    }
  },
  "cta_settings": {
    "fallback_branch": "navigation_hub",  // ✅ Fallback configured
    "max_display": 3
  }
}
```

### Phase 3: Testing & Validation

**Testing Checklist**:

1. **Test Action Chip Routing (Tier 1)**:
   - [ ] Click each action chip
   - [ ] Verify correct CTAs display
   - [ ] Confirm routing to expected branch

2. **Test Fallback Routing (Tier 3)**:
   - [ ] Type free-form query (e.g., "What can I do?")
   - [ ] Verify fallback CTAs display
   - [ ] Confirm no dead ends

3. **Test Backward Compatibility**:
   - [ ] Verify v1.3 configs still work (if any remain)
   - [ ] Check no console errors
   - [ ] Verify keyword detection bypassed

**Validation Script** (manual for now):
```bash
# 1. Check config in S3
aws s3 cp s3://myrecruiter-picasso/tenants/{tenant_id}/{tenant_id}-config.json - | jq '.action_chips'

# 2. Verify dictionary format
jq '.action_chips.default_chips | type' # Should output "object"

# 3. Check fallback branch configured
jq '.cta_settings.fallback_branch' # Should output branch name
```

---

## Rollback Procedure

If migration causes issues:

### Step 1: Restore v1.3 Config from Backup

```bash
# Restore from backup
aws s3 cp s3://myrecruiter-picasso-backups/tenants/{tenant_id}/{tenant_id}-config-v1.3.json \
         s3://myrecruiter-picasso/tenants/{tenant_id}/{tenant_id}-config.json

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id E1234567890 \
  --paths "/tenants/{tenant_id}/*"
```

### Step 2: Verify Rollback

- Widget loads without errors
- Action chips display correctly
- CTAs show for queries (keyword-based routing restored)

**Note**: Lambda routing logic handles v1.3 configs gracefully, so rollback is safe.

---

## Tenant-by-Tenant Migration Plan

### Priority 1: Pilot Tenants (Week 1)

Test with 3-5 low-risk tenants:
- **MYR384719** (Atlanta Angels) - Active, good test case
- **AUS123957** (Test tenant) - Staging environment
- 2-3 other low-traffic tenants

**Success Criteria**:
- Zero errors in Lambda logs
- CTA click-through rate stable or improved
- No user-reported issues

### Priority 2: Production Rollout (Weeks 2-4)

Gradual rollout:
- Week 2: 10 tenants
- Week 3: 20 tenants
- Week 4: Remaining tenants

**Monitoring**:
- Track routing tier usage (Tier 1 vs Tier 3)
- Monitor CTA engagement metrics
- Alert on high Tier 3 fallback rate (>50%)

---

## Troubleshooting

### Issue 1: Action Chip IDs Not Generated

**Symptoms**: Config still has array format after deployment

**Cause**: Lambda not running latest version

**Fix**:
```bash
# Deploy latest Lambda version
aws lambda update-function-code \
  --function-name deploy_tenant_stack \
  --zip-file fileb://deployment.zip
```

### Issue 2: Routing Not Working (Still Using Keywords)

**Symptoms**: CTAs don't match action chip clicks

**Cause**: Master Function using old routing logic

**Fix**:
```bash
# Deploy latest Master Function
aws lambda update-function-code \
  --function-name Master_Function_Staging \
  --zip-file fileb://deployment.zip

# Verify routing logic
grep "get_conversation_branch" lambda_function.py
```

### Issue 3: No CTAs Showing After Migration

**Symptoms**: Blank CTA section after clicking action chip

**Cause**: `target_branch` references non-existent branch

**Fix**:
1. Check Lambda logs for warning: `[Tier 1] Invalid target_branch: ...`
2. Verify branch exists: `jq '.conversation_branches | keys'`
3. Update `target_branch` to valid branch name
4. Or set `fallback_branch` to ensure CTAs always show

### Issue 4: Duplicate Action Chip IDs

**Symptoms**: Multiple chips have same ID (e.g., `volunteer`, `volunteer_2`)

**Cause**: Similar labels generated same base ID

**Fix**:
1. This is expected behavior - collision detection appends `_2`, `_3`, etc.
2. No action needed unless IDs are confusing
3. Future: Config Builder will allow custom ID assignment

### Issue 5: Fallback Branch Not Showing CTAs

**Symptoms**: Free-form queries show no CTAs despite `fallback_branch` configured

**Cause**: Fallback branch exists but has no `available_ctas` defined

**Fix**:
```bash
# Check if fallback branch has CTAs
jq '.conversation_branches.navigation_hub.available_ctas' config.json

# If null, add CTAs to the branch configuration
```

---

## FAQ

**Q: Do I need to migrate all tenants immediately?**
A: No. v1.3 configs continue working indefinitely. Migrate gradually.

**Q: What happens if I don't configure `fallback_branch`?**
A: Free-form queries show no CTAs (same as v1.3 keyword miss). Not breaking, but suboptimal UX.

**Q: Can I mix v1.3 and v1.4.1 tenants?**
A: Yes. Lambda routes correctly for both versions.

**Q: How do I know if migration was successful?**
A: Check S3 config has dictionary format + Lambda logs show Tier 1 routing.

**Q: What if action chip IDs collide?**
A: Lambda automatically appends `_2`, `_3`, etc. No manual intervention needed.

**Q: Can I customize action chip IDs?**
A: Not in MVP. Future Config Builder enhancement will allow custom IDs.

**Q: What happens to `detection_keywords` in v1.4.1?**
A: Field is ignored by routing logic but safe to keep for backward compatibility. Can be removed.

**Q: How do I test routing without deploying to production?**
A: Use staging environment with test tenant. Deploy config to staging S3 bucket first.

**Q: What if I delete a conversation branch that action chips reference?**
A: Lambda falls back to `fallback_branch` gracefully. Config Builder will show warnings.

**Q: How long does migration take per tenant?**
A: 15-30 minutes: 5 min backup, 10 min linking chips, 5-10 min testing.

---

## Step-by-Step Migration Example

### Example: Migrating Atlanta Angels (MYR384719)

**Step 1: Backup Current Config**
```bash
aws s3 cp s3://myrecruiter-picasso/tenants/MYR384719/MYR384719-config.json \
         s3://myrecruiter-picasso-backups/tenants/MYR384719/MYR384719-config-v1.3-$(date +%Y%m%d).json
```

**Step 2: Verify Automatic Transformation**
```bash
# Download current config
aws s3 cp s3://myrecruiter-picasso/tenants/MYR384719/MYR384719-config.json .

# Check action chips format
jq '.action_chips.default_chips | type' MYR384719-config.json
# Expected output: "object" (dictionary)

# List generated IDs
jq '.action_chips.default_chips | keys' MYR384719-config.json
# Expected output: ["donate", "lovebox_apply", "volunteer"]
```

**Step 3: Configure Fallback Branch**

Edit config to add fallback branch:
```json
{
  "cta_settings": {
    "fallback_branch": "navigation_hub",
    "max_display": 3,
    "bundling_strategy": "readiness_based"
  },
  "conversation_branches": {
    "navigation_hub": {
      "available_ctas": {
        "primary": "volunteer_apply",
        "secondary": ["lovebox_info", "schedule_discovery", "contact_us"]
      }
    }
  }
}
```

**Step 4: Link Action Chips to Branches**

Update action chips with explicit routing:
```json
{
  "action_chips": {
    "default_chips": {
      "volunteer": {
        "id": "volunteer",
        "label": "Volunteer",
        "value": "Tell me about volunteering",
        "target_branch": "volunteer_interest"
      },
      "lovebox_apply": {
        "id": "lovebox_apply",
        "label": "Love Box",
        "value": "Tell me about the Love Box program",
        "target_branch": "lovebox_discussion"
      },
      "donate": {
        "id": "donate",
        "label": "Donate",
        "value": "How can I donate?",
        "target_branch": "donation_interest"
      }
    }
  }
}
```

**Step 5: Validate Configuration**
```bash
# Check all target branches exist
jq '.conversation_branches | keys' MYR384719-config.json
# Should include: volunteer_interest, lovebox_discussion, donation_interest, navigation_hub

# Verify each branch has CTAs
jq '.conversation_branches.volunteer_interest.available_ctas' MYR384719-config.json
jq '.conversation_branches.lovebox_discussion.available_ctas' MYR384719-config.json
jq '.conversation_branches.donation_interest.available_ctas' MYR384719-config.json
jq '.conversation_branches.navigation_hub.available_ctas' MYR384719-config.json
```

**Step 6: Deploy to Staging**
```bash
# Upload to staging
aws s3 cp MYR384719-config.json s3://myrecruiter-picasso-staging/tenants/MYR384719/MYR384719-config.json

# Test in staging widget
open "https://staging.picasso.example.com/?tenant=MYR384719"
```

**Step 7: Test Routing**
- Click "Volunteer" chip → Should show volunteer CTAs
- Click "Love Box" chip → Should show Love Box CTAs
- Type "What can I do?" → Should show navigation hub CTAs
- Verify no console errors

**Step 8: Deploy to Production**
```bash
# Upload to production
aws s3 cp MYR384719-config.json s3://myrecruiter-picasso/tenants/MYR384719/MYR384719-config.json

# Invalidate cache
aws cloudfront create-invalidation --distribution-id E1234567890 --paths "/tenants/MYR384719/*"
```

**Step 9: Monitor**
```bash
# Check Lambda logs for routing tier usage
aws logs filter-log-events \
  --log-group-name /aws/lambda/Master_Function_Staging \
  --filter-pattern "[Tier 1]" \
  --start-time $(date -u -d '5 minutes ago' +%s)000
```

---

## Support

**Questions**: Contact DevOps team
**Issues**: Create ticket in JIRA with tag `action-chips-routing`
**Documentation**: See `/Picasso/docs/TENANT_CONFIG_SCHEMA.md`

**Related Documentation**:
- [TENANT_CONFIG_SCHEMA.md](./TENANT_CONFIG_SCHEMA.md) - Complete schema reference
- [PRD_ACTION_CHIPS_EXPLICIT_ROUTING_FALLBACK_HUB.md](./PRD_ACTION_CHIPS_EXPLICIT_ROUTING_FALLBACK_HUB.md) - Product requirements

---

**Document Version**: 1.0
**Last Updated**: 2025-10-30
**Next Review**: After 10 tenant migrations
