# Bedrock Streaming Handler Deployment Instructions

## Overview
This deploys the simplified `bedrock_streaming_handler.py` to AWS Lambda, replacing the JWT-requiring version with a simpler tenant_hash/session_id authentication model.

## Files Created
- `bedrock_streaming_handler.py` - Combined streaming handler with caching
- `requirements.txt` - Minimal dependencies (boto3/botocore only)
- `bedrock-streaming-deployment.zip` - Deployment package (9KB)

## Key Changes from Previous Version
1. **No JWT validation** - Uses simple tenant_hash/session_id
2. **KB caching** - 5-minute TTL cache for knowledge base queries
3. **Response caching** - Cache common queries for faster responses
4. **Simplified config loading** - Direct S3 access without complex loader
5. **SSE format output** - Proper Server-Sent Events formatting

## Deployment Steps

### 1. Deploy to Lambda Console

```bash
# Option 1: AWS CLI deployment
aws lambda update-function-code \
  --function-name Bedrock_Streaming_Handler_Staging \
  --zip-file fileb://bedrock-streaming-deployment.zip

# Option 2: Console deployment
# 1. Go to AWS Lambda Console
# 2. Navigate to Bedrock_Streaming_Handler_Staging
# 3. Upload bedrock-streaming-deployment.zip
# 4. Click "Deploy"
```

### 2. Update Environment Variables

Set these environment variables in the Lambda:
```
CONFIG_BUCKET=myrecruiter-picasso
```

### 3. Update Lambda Configuration

- **Timeout**: 30 seconds
- **Memory**: 512 MB (for caching)
- **Handler**: `bedrock_streaming_handler.lambda_handler`
- **Runtime**: Python 3.10+

### 4. Enable Function URL Streaming

```bash
# Enable response streaming on the function URL
aws lambda update-function-url-config \
  --function-name Bedrock_Streaming_Handler_Staging \
  --invoke-mode RESPONSE_STREAM
```

### 5. Test the Deployment

```bash
# Test with curl
curl -X POST https://your-function-url.lambda-url.region.on.aws/ \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_hash": "my87674d777bf9",
    "session_id": "test123",
    "user_input": "Hello, what services do you offer?"
  }'
```

## Expected Response Format

The handler returns Server-Sent Events (SSE) format:
```
data: {"type": "text", "content": "Hello", "session_id": "test123"}
data: {"type": "text", "content": " there", "session_id": "test123"}
data: {"type": "text", "content": "!", "session_id": "test123"}
data: [DONE]
```

## Cleanup Recommendations

After deployment, remove these unnecessary files from the Lambda:
- All JWT-related files (jwt/, PyJWT-2.10.1.dist-info/)
- Old handler files (streaming_handler.py, streaming_handler_simple.py)
- Test files (test-streaming.html)
- Old deployment packages (*.zip files)

Keep only:
- `bedrock_streaming_handler.py` (renamed to `lambda_function.py`)
- boto3/botocore dependencies (if not using Lambda layers)

## Rollback Plan

If issues occur:
1. Keep the previous version as an alias
2. Switch traffic back to previous version
3. Debug issues in staging environment

## Monitoring

Check CloudWatch Logs for:
- ✅ Successful KB retrievals
- ⏱️ Performance metrics (first token time, total time)
- ❌ Error messages
- 🔥 Cache warming operations

## Performance Expectations

- First token: < 1 second
- Total response: < 5 seconds
- Cache hit rate: > 60% after warm-up
- Memory usage: < 200MB

## Integration with Picasso

Update `src/config/environment.js` in Picasso to point to the new endpoint:
```javascript
getStreamingUrl: () => {
  // Use dedicated streaming endpoint
  return 'https://your-function-url.lambda-url.region.on.aws/';
}
```