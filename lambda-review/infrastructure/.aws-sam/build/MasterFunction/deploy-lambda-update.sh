#!/bin/bash

# Deploy Lambda function update script
echo "🚀 Deploying Lambda function update..."

# Create deployment package
cd lambda-review
zip -r ../lambda-deployment.zip .

# Update the Lambda function code
echo "📦 Uploading updated code to Lambda..."
aws lambda update-function-code \
    --function-name Master_Function \
    --zip-file fileb://../lambda-deployment.zip \
    --region us-east-1

# Wait for update to complete
echo "⏳ Waiting for update to complete..."
aws lambda wait function-updated \
    --function-name Master_Function \
    --region us-east-1

# Get function status
echo "✅ Update complete. Function status:"
aws lambda get-function \
    --function-name Master_Function \
    --region us-east-1 \
    --query 'Configuration.{FunctionName:FunctionName,State:State,LastModified:LastModified}' \
    --output table

echo "🎉 Lambda function updated successfully!"