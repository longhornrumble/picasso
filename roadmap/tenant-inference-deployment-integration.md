# Tenant Inference System & Deployment Lambda Integration

**Date:** August 14, 2025  
**Status:** Critical Architecture Decision  
**Priority:** P0 - Blocking production testing  

## Executive Summary

The hash-based tenant identification system is **NOT being deprecated** but is being integrated into a new multi-tier tenant inference system. The deployment Lambda requires significant updates to support the new inference hierarchy while maintaining backward compatibility.

## Current Architecture Analysis

### Deployment Lambda (`deploy_tenant_stack`)
- **Hash-centric design**: Generates unique tenant hashes for each deployment
- **S3 mapping creation**: Stores `mappings/{tenant_hash}.json` files for tenant lookup
- **Widget integration**: Generates embed codes using `data-tenant="{tenant_hash}"`
- **API endpoints**: Creates hash-based config URLs for runtime Lambda

### Runtime Lambda (`Master_Function_Staging`)
- **Multi-tier inference**: JWT → Host → Origin → Path → **Hash (fallback)**
- **S3 dependency**: Loads tenant registry from mapping files created by deployment Lambda
- **Backward compatibility**: Still requires tenant hash for all operations

## The Core Problem

**Mismatch in data expectations:**

1. **Deployment Lambda creates:** Basic mapping files with only metadata
   ```json
   {
     "tenant_id": "MYR384719",
     "tenant_hash": "my87674d777bf9", 
     "created_at": 1755018200,
     "created_by": "deploy_lambda",
     "version": "1.0"
   }
   ```

2. **Runtime inference expects:** Rich mapping files with domain information
   ```json
   {
     "tenant_id": "MYR384719",
     "tenant_hash": "my87674d777bf9",
     "host": "mycompany.com",
     "origin": "https://mycompany.com",
     "paths": ["/chat", "/support"],
     "created_at": 1755018200,
     "version": "2.0"
   }
   ```

## Required Changes

### 1. Deployment Lambda Updates (CRITICAL)

**File:** `deploy_tenant_stack/lambda_function.py`

#### A. Update `store_tenant_mapping()` function (line 686):
```python
def store_tenant_mapping(tenant_id: str, tenant_hash: str, bubble_data: dict):
    """Store enhanced tenant mapping with domain information for inference"""
    
    # Extract domain information from Bubble data
    primary_domain = bubble_data.get("primary_domain", "").strip()
    allowed_paths = bubble_data.get("allowed_paths", [])
    
    mapping_data = {
        "tenant_id": tenant_id,
        "tenant_hash": tenant_hash,
        "created_at": int(time.time()),
        "created_by": "deploy_lambda",
        "version": "2.0"
    }
    
    # Add domain information for inference system
    if primary_domain:
        mapping_data["host"] = primary_domain
        mapping_data["origin"] = f"https://{primary_domain}"
        
    if allowed_paths:
        mapping_data["paths"] = allowed_paths
        
    # For staging/testing - add localhost support
    if tenant_id == "MYR384719":  # MyRecruiter staging
        mapping_data.update({
            "staging_hosts": ["localhost", "localhost:8000", "127.0.0.1", "127.0.0.1:8000"],
            "staging_origins": ["http://localhost:8000", "http://localhost", "http://127.0.0.1:8000"]
        })
    
    # Store mapping file
    mapping_key = f"{MAPPINGS_PREFIX}/{tenant_hash}.json"
    s3.put_object(
        Bucket=PRODUCTION_BUCKET,
        Key=mapping_key,
        Body=json.dumps(mapping_data, indent=2),
        ContentType="application/json",
        CacheControl="public, max-age=86400"
    )
```

#### B. Add input validation for new fields:
```python
def validate_bubble_input(bubble_data: dict) -> list:
    """Validate Bubble input including new domain fields"""
    warnings = []
    
    # Existing validations...
    
    # New domain validations
    primary_domain = bubble_data.get("primary_domain", "").strip()
    if not primary_domain:
        warnings.append("Missing primary_domain - tenant will only work with hash-based inference")
    elif not re.match(r'^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', primary_domain):
        warnings.append("Invalid primary_domain format")
        
    return warnings
```

### 2. Bubble Interface Requirements

**New required fields in Bubble tenant setup:**
- `primary_domain` (string) - Customer's primary website domain
- `allowed_paths` (array) - Specific URL paths where widget can be embedded
- `staging_mode` (boolean) - Enable localhost testing for development

**API payload update:**
```json
{
  "tenant_id": "MYR384719",
  "primary_domain": "civitashospice.com",
  "allowed_paths": ["/", "/contact", "/about"],
  "chat_title": "Civitas Virtual Assistant",
  // ... existing fields
}
```

### 3. Runtime Lambda Enhancements

**Already implemented with hardcoded bypass, but production requires:**
- Dynamic registry loading from enhanced mapping files
- Graceful fallback to hash-based inference when domain inference fails
- Logging and monitoring for inference success rates

## Implementation Timeline

### Phase 1: Immediate (This Week)
- [x] **Fix staging testing**: Add localhost fields to MyRecruiter mapping manually
- [ ] **Update deployment Lambda**: Implement enhanced mapping creation
- [ ] **Test with staging tenant**: Verify new mapping format works

### Phase 2: Bubble Integration (Next Week)  
- [ ] **Coordinate with Bubble team**: Add domain configuration fields
- [ ] **Update API contract**: Include new fields in deployment payload
- [ ] **Migration script**: Backfill existing tenants with domain information

### Phase 3: Production Rollout (Following Week)
- [ ] **Deploy updated deployment Lambda**: With enhanced mapping support
- [ ] **Remove hardcoded bypasses**: From runtime Lambda  
- [ ] **Monitor inference rates**: Track success/failure patterns
- [ ] **Documentation update**: Reflect new deployment process

## Risk Assessment

### High Risk
- **Backward compatibility**: Must ensure existing hash-based integrations continue working
- **Data migration**: All existing tenants need domain information added

### Medium Risk  
- **Bubble coordination**: New fields must be validated and tested
- **Testing complexity**: Multiple inference paths need validation

### Low Risk
- **Runtime performance**: New inference system designed for efficiency
- **Rollback capability**: Can revert to hash-only system if needed

## Success Criteria

1. **Staging tests pass**: MyRecruiter widget loads with proper branding from localhost
2. **Production compatibility**: Existing tenants continue working during migration
3. **New tenant onboarding**: Supports both domain-based and hash-based inference
4. **Performance metrics**: No degradation in config loading times
5. **Developer experience**: Localhost testing works seamlessly

## Dependencies

- **Bubble team**: Must implement new domain configuration fields
- **DevOps**: Deployment pipeline updates for new Lambda code
- **QA**: Comprehensive testing across inference scenarios

## Notes

- Hash system remains the **definitive tenant identifier** and primary integration method
- Domain-based inference adds **security and user experience benefits** by eliminating need for tenant hash in URLs
- **Fallback architecture** ensures high availability even if domain inference fails

---

**Next Action**: Update deployment Lambda `store_tenant_mapping()` function with enhanced mapping format.