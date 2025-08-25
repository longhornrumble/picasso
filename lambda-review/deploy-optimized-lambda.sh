#!/bin/bash

# Deploy optimized Lambda with caching

FUNCTION_NAME="Master_Function_Staging"
REGION="us-east-1"

echo "📦 Creating deployment package..."
cd lambda-review

# Create a clean deployment directory
rm -rf deployment
mkdir deployment

# Copy all Python files
cp *.py deployment/

# Create zip file
cd deployment
zip -r ../lambda-optimized.zip .
cd ..

echo "🚀 Deploying to Lambda..."
aws lambda update-function-code \
    --function-name $FUNCTION_NAME \
    --zip-file fileb://lambda-optimized.zip \
    --region $REGION

echo "✅ Deployment complete!"
echo ""
echo "🔥 Key optimizations deployed:"
echo "  - In-memory caching for KB queries (5 min TTL)"
echo "  - Response caching for common questions"
echo "  - Cache warming for action cards & quick help menu"
echo "  - Reduced KB results from 8 to 5"
echo "  - Using Claude Haiku for faster responses"
echo "  - Added timing instrumentation"
echo ""
echo "Expected improvements:"
echo "  - First response: 3-4 seconds (from 9-10 seconds)"
echo "  - Cached responses: <1 second"
echo "  - Action cards & quick help: Instant (pre-cached)"
echo ""
echo "🔥 Cache Warming:"
echo "  - Automatic: On Lambda cold start for empty cache"
echo "  - Manual: GET /Master_Function?action=warm_cache&t=TENANT_HASH"
echo "  - Pre-caches all action card and quick help menu questions"