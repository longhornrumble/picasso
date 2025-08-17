# CRITICAL STAGING DEPLOYMENT INSTRUCTIONS

## STATUS: BUILD COMPLETED - READY FOR DEPLOYMENT

**Build Completion Time:** August 13, 2025 11:31 AM  
**Environment:** Production build with staging configuration  
**AWS Issue:** Credentials not configured - manual deployment required

---

## 🚀 DEPLOYMENT ARTIFACTS READY

All local Picasso changes have been successfully built and are ready for staging deployment:

### ✅ Widget Visibility Fixes
- **File:** `dist/widget.js` (87.5KB)
- **Contains:** current-widget.js with all visibility improvements
- **Features:** applyMinimizedStyles(), iframe height expansion, state management fixes

### ✅ Track A+ Integration  
- **File:** `dist/assets/iframe.js` (44KB)
- **Contains:** ConversationManager.js with server endpoint integration
- **Features:** Enhanced conversation persistence, state token management, API bridge

### ✅ Environment Configuration
- **File:** `dist/assets/theme-CgUBHgXi.js` (261KB) 
- **Contains:** Updated environment.js with staging endpoints
- **Features:** Proper API Gateway routing, CloudFront paths, Track A+ Lambda integration

### ✅ Staging Assets
- **widget-frame.html** - Dynamic staging detection
- **widget-frame-staging.html** - Staging-specific paths  
- **assets/*.css** - Styling optimizations (114KB total)
- **assets/*.js** - All React components and utilities

---

## 📋 MANUAL DEPLOYMENT STEPS

Since AWS CLI credentials are not configured, deployment must be completed manually:

### Step 1: Configure AWS Credentials
```bash
aws configure
# or
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
export AWS_DEFAULT_REGION=us-east-1
```

### Step 2: Deploy Core Widget
```bash
aws s3 cp dist/widget.js s3://picassostaging/staging/widget.js \
    --content-type "application/javascript"
```

### Step 3: Deploy Widget Frames
```bash
aws s3 cp dist/widget-frame.html s3://picassostaging/staging/widget-frame.html \
    --content-type "text/html"
    
aws s3 cp dist/widget-frame-staging.html s3://picassostaging/staging/widget-frame-staging.html \
    --content-type "text/html"
```

### Step 4: Deploy All Assets
```bash
aws s3 sync dist/assets/ s3://picassostaging/staging/assets/ \
    --delete --exclude "*.DS_Store"
```

### Step 5: Deploy Additional Files
```bash
aws s3 sync dist/ s3://picassostaging/staging/ \
    --exclude "assets/*" --exclude "*.DS_Store" --exclude ".git/*"
```

### Step 6: Invalidate CloudFront Cache
```bash
aws cloudfront create-invalidation \
    --distribution-id E3G0LSWB1AQ9LP \
    --paths "/staging/widget.js" "/staging/widget-frame.html" \
            "/staging/widget-frame-staging.html" "/staging/assets/*"
```

---

## 🧪 POST-DEPLOYMENT VALIDATION

### Test URLs (After Deployment)
- **Widget:** https://chat.myrecruiter.ai/staging/widget.js
- **Frame:** https://chat.myrecruiter.ai/staging/widget-frame.html  
- **Staging Frame:** https://chat.myrecruiter.ai/staging/widget-frame-staging.html

### Test Widget Loading
```html
<!DOCTYPE html>
<html>
<head>
    <title>Staging Widget Test</title>
</head>
<body>
    <h1>Testing Staging Deployment</h1>
    
    <script src="https://chat.myrecruiter.ai/staging/widget.js"></script>
    <script>
        console.log('Testing widget initialization...');
        PicassoWidget.init('my87674d777bf9', {
            position: 'bottom-right'
        });
    </script>
</body>
</html>
```

### Validate Track A+ Features
1. **Conversation Context:** Should persist across sessions
2. **API Integration:** Should connect to staging Lambda endpoints
3. **Streaming:** Should work with JWT authentication  
4. **Mobile Safari:** Should handle SSE properly

---

## ✅ EXPECTED OUTCOMES

After successful deployment:

1. **Widget Visibility Issues Resolved**
   - Proper initialization and state management  
   - Correct iframe height expansion
   - No more widget visibility problems

2. **Track A+ Functionality Active**
   - Conversational context working in staging
   - Lambda conversation endpoints accessible
   - Proper frontend-backend integration

3. **Environment Routing Fixed**  
   - All staging URLs pointing to correct infrastructure
   - API Gateway routing to Track A+ enabled Lambda
   - CloudFront serving from staging paths

---

## 🚨 CRITICAL SUCCESS CRITERIA

- [ ] Widget loads from https://chat.myrecruiter.ai/staging/widget.js
- [ ] Widget-frame loads with proper asset paths  
- [ ] Widget initializes without console errors
- [ ] Chat functionality works with staging API endpoints
- [ ] Conversation context persists (Track A+)
- [ ] Mobile compatibility maintained
- [ ] All assets accessible under /staging/ path

---

## 📞 NEXT STEPS

1. **Configure AWS credentials** and re-run deployment script
2. **Test staging widget** with Foster Village tenant
3. **Validate Track A+ features** work end-to-end  
4. **Monitor staging performance** and error rates

The build is complete and all artifacts are ready. The deployment failure was only due to AWS credential configuration, not any issues with the code or build process.

**All Picasso changes are successfully built and ready for staging deployment.**