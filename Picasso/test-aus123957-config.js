// CRITICAL: This file must load BEFORE widget.js
// It clears all caches and sets Austin Angels configuration

console.log('🧹 [PRE-WIDGET] Clearing all caches...');
sessionStorage.clear();
localStorage.clear();
console.log('✅ [PRE-WIDGET] All caches cleared');

// Force development mode and point to AUS123957 production config
window.PICASSO_ENV = 'development';
window.PICASSO_TENANT_HASH = 'auc5b0ecb0adcb';

// Point directly to the S3 config with cache buster
window.PICASSO_CONFIG_PATH = 'https://myrecruiter-picasso.s3.amazonaws.com/tenants/AUS123957/AUS123957-config.json?v=' + Date.now();

// Enable debug logging
window.PICASSO_DEBUG = true;

console.log('🎯 [PRE-WIDGET] Loading Picasso for Austin Angels (AUS123957)');
console.log('📋 [PRE-WIDGET] Config path:', window.PICASSO_CONFIG_PATH);
console.log('📋 [PRE-WIDGET] Tenant hash:', window.PICASSO_TENANT_HASH);
console.log('📋 [PRE-WIDGET] Environment:', window.PICASSO_ENV);
console.log('✅ [PRE-WIDGET] Configuration complete, widget will load next');
