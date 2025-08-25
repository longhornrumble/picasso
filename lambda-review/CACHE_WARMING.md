# Cache Warming for Action Cards & Quick Help Menu

## Overview

Cache warming pre-loads responses for commonly clicked questions (action cards and quick help menu items) to provide instant responses when users interact with these UI elements.

## How It Works

### 1. Automatic Cache Warming
- **Triggers on**: Lambda cold start when cache is empty
- **Process**: 
  1. Loads tenant configuration from S3
  2. Extracts all action card questions
  3. Extracts all quick help menu questions
  4. Pre-generates and caches responses for each question
  5. Cache persists for 5 minutes (standard TTL)

### 2. Manual Cache Warming
```bash
# Warm cache for a specific tenant
GET https://chat.myrecruiter.ai/Master_Function?action=warm_cache&t=TENANT_HASH

# Response
{
  "success": true,
  "message": "Cache warmed successfully for tenant my87674d...",
  "questions_cached": 5,
  "tenant_hash": "my87674d...",
  "timestamp": "2025-08-20T12:00:00Z"
}
```

### 3. Cache Architecture

```python
# Two-level caching system
KB_CACHE = {}        # Caches knowledge base retrieval results
RESPONSE_CACHE = {}  # Caches final Claude responses

# Cache key generation
cache_key = md5_hash(question + kb_id)  # For KB cache
cache_key = md5_hash(prompt + model_id) # For response cache
```

## What Gets Cached

### From Action Cards
```json
{
  "action_cards": [
    {"text": "How do I apply?", "icon": "📝"},
    {"text": "What are the requirements?", "icon": "📋"},
    {"text": "Contact information", "icon": "📞"}
  ]
}
```

### From Quick Help Menu
```json
{
  "quick_help_menu": {
    "enabled": true,
    "items": [
      {"text": "Tell me about your services"},
      {"text": "How can I volunteer?"},
      {"text": "Where are you located?"}
    ]
  }
}
```

## Performance Impact

### Before Cache Warming
- First click on action card: 6-9 seconds
- Subsequent clicks (within 5 min): <1 second
- After cache expiry: 6-9 seconds again

### After Cache Warming
- First click on action card: **<1 second** (instant)
- All clicks within 5 minutes: **<1 second**
- Auto-rewarms on next request after expiry

## Testing Cache Warming

Use the provided test script:
```bash
cd lambda-review
./test-cache-warming.sh
```

Or manually test:
```bash
# 1. Check cache status
curl https://chat.myrecruiter.ai/Master_Function?action=cache_status

# 2. Warm the cache
curl "https://chat.myrecruiter.ai/Master_Function?action=warm_cache&t=YOUR_TENANT_HASH"

# 3. Test a cached question (should be instant)
time curl -X POST "https://chat.myrecruiter.ai/Master_Function?action=chat&t=YOUR_TENANT_HASH" \
  -H "Content-Type: application/json" \
  -d '{"tenant_hash": "YOUR_TENANT_HASH", "user_input": "How do I apply?", "session_id": "test123"}'
```

## Deployment

1. **Deploy the optimized Lambda**:
```bash
cd lambda-review
./deploy-optimized-lambda.sh
```

2. **Verify deployment**:
```bash
# Check that cache warming is available
curl https://chat.myrecruiter.ai/Master_Function?action=cache_status
# Should show cache_enabled: true
```

3. **Pre-warm for production tenants** (optional):
```bash
# Warm cache for each important tenant
for tenant in "tenant_hash_1" "tenant_hash_2"; do
  curl "https://chat.myrecruiter.ai/Master_Function?action=warm_cache&t=$tenant"
done
```

## Monitoring

### CloudWatch Logs
Look for these log entries:
- `🔥 Cache warming started for tenant: my87674d...`
- `✅ Cached response for: How do I apply?...`
- `🔥 Cache warming complete: 5 questions cached`
- `✅ KB Cache hit for: How do I apply?...` (when cache is used)

### Metrics to Track
- Cache hit rate (should be high for action cards)
- Average response time for cached vs uncached
- Cache warming execution time (should be <5 seconds)

## Limitations

1. **5-minute TTL**: Cache expires after 5 minutes
2. **Container-specific**: Cache is per Lambda container (not shared)
3. **Cold starts**: New containers start with empty cache
4. **Memory limits**: Very large tenants might exceed cache size

## Future Improvements

1. **Persistent caching**: Use ElastiCache or DynamoDB for cross-container cache
2. **Predictive warming**: Warm cache based on usage patterns
3. **Longer TTL for action cards**: These rarely change, could cache longer
4. **Background warming**: Refresh cache before expiry