# esbuild Migration Plan - Picasso Widget Build System Transformation

**Date**: January 17, 2025  
**Author**: AI Development Team  
**Status**: Planning  
**Target Completion**: January 24, 2025  

## Executive Summary

This document outlines the migration plan from Vite to esbuild for the Picasso widget build system. The migration aims to simplify the build process, improve build performance by 50-100x, reduce dependencies, and increase reliability for production deployments.

### Key Benefits
- **Build Speed**: 10-100x faster builds (from ~3s to <100ms)
- **Simplicity**: Single 150-line config vs 182-line Vite config + plugins
- **Reliability**: Fewer moving parts, more predictable builds
- **Maintenance**: Reduced dependency footprint (esbuild only vs Vite + Rollup + plugins)

## Current State Analysis

### Vite Implementation (Current Primary)
```
✅ Implemented:
- Full environment switching (dev/staging/production)
- CSS injection via plugin
- Code splitting (React vendor, security chunks)
- Path aliases (@components, @utils, etc.)
- Console stripping in production
- HMR support
- CORS configuration
- Bundle size warnings

❌ Issues:
- Complex configuration (182 lines + plugins)
- Slower build times
- Heavy dependency chain
- Occasional reliability issues reported
```

### esbuild Implementation (Current Secondary)
```
✅ Already Working (70% complete):
- Dev server on port 8000
- Dual entry points (widget & iframe)
- JSX transformation
- CSS bundling
- Static file copying
- Basic minification
- Source maps (dev only)
- Image/SVG handling

❌ Missing Features (30% to implement):
- Environment switching (hardcoded to staging)
- CSS injection into JS
- Code splitting
- Path aliases
- Console stripping for production
- CORS headers configuration
```

### Code Impact Assessment
- **5 files** use `import.meta.env` (Vite-specific)
- **35 files** have Vite references (mostly in tests/comments)
- **No deep Vite integration** in application logic
- **Migration complexity: LOW**

## Implementation Phases

### Phase 1: Environment Configuration Enhancement
**Timeline**: 2 hours  
**Priority**: Critical  

#### Tasks:
1. **Update esbuild.config.mjs to support environment switching**
   ```javascript
   const environment = process.env.BUILD_ENV || 'development';
   const isProduction = environment === 'production';
   const isStaging = environment === 'staging';
   ```

2. **Create environment-specific configurations**
   - Development: localhost URLs, source maps, no minification
   - Staging: staging URLs, no source maps, minification
   - Production: production URLs, no source maps, aggressive minification

3. **Define environment variables properly**
   ```javascript
   define: {
     '__ENVIRONMENT__': JSON.stringify(environment),
     '__API_BASE_URL__': JSON.stringify(getApiUrl(environment)),
     '__WIDGET_DOMAIN__': JSON.stringify(getWidgetDomain(environment)),
     '__CONFIG_DOMAIN__': JSON.stringify(getConfigDomain(environment)),
     '__BUILD_TIME__': JSON.stringify(new Date().toISOString()),
     '__VERSION__': JSON.stringify('2.0.0'),
     'process.env.NODE_ENV': JSON.stringify(environment),
     'import.meta.env.DEV': JSON.stringify(!isProduction),
     'import.meta.env.PROD': JSON.stringify(isProduction),
     'import.meta.env.BASE_URL': JSON.stringify('/')
   }
   ```

### Phase 2: Feature Parity Implementation
**Timeline**: 3 hours  
**Priority**: High  

#### Tasks:
1. **Implement CSS injection strategy**
   - Option A: Build CSS into JS modules (simpler, larger bundles)
   - Option B: Keep separate CSS with proper loading (current approach)
   - Decision: Start with Option B (already working), optimize later

2. **Add path aliases for cleaner imports**
   ```javascript
   alias: {
     '@': path.resolve(__dirname, 'src'),
     '@components': path.resolve(__dirname, 'src/components'),
     '@utils': path.resolve(__dirname, 'src/utils'),
     '@styles': path.resolve(__dirname, 'src/styles'),
     '@config': path.resolve(__dirname, 'src/config')
   }
   ```

3. **Implement production optimizations**
   ```javascript
   minify: isProduction,
   drop: isProduction ? ['console', 'debugger'] : [],
   treeShaking: true,
   target: 'es2018',
   legalComments: 'none'
   ```

4. **Add bundle analysis capabilities**
   ```javascript
   metafile: true, // Generate build metadata
   analyze: process.env.ANALYZE === 'true'
   ```

### Phase 3: Code Migration
**Timeline**: 1 hour  
**Priority**: High  

#### Files to Update:
1. **src/context/ChatProvider.jsx**
   - Replace: `import.meta.env?.DEV`
   - With: `__ENVIRONMENT__ === 'development'`

2. **src/config/environment.js**
   - Replace: `import.meta.env.DEV` / `import.meta.env.PROD`
   - With: defined constants

3. **src/utils/mobileCompatibility.js**
   - Replace: `import.meta.env.BASE_URL`
   - With: `'/'` or defined constant

4. **src/config/environment-resolver.ts**
   - Update environment detection logic

5. **Remove Vite-specific test configurations**
   - Update test setup files
   - Remove Vite test utilities

### Phase 4: Build Script Updates
**Timeline**: 1 hour  
**Priority**: Critical  

#### Package.json Updates:
```json
{
  "scripts": {
    "dev": "BUILD_ENV=development node esbuild.config.mjs --serve",
    "build": "BUILD_ENV=production node esbuild.config.mjs",
    "build:dev": "BUILD_ENV=development node esbuild.config.mjs",
    "build:staging": "BUILD_ENV=staging node esbuild.config.mjs",
    "build:production": "BUILD_ENV=production node esbuild.config.mjs",
    "preview": "npx serve dist -p 3000 --cors",
    "clean": "rm -rf dist",
    "analyze": "ANALYZE=true BUILD_ENV=production node esbuild.config.mjs"
  }
}
```

#### Remove Scripts:
- All `vite` commands
- Vite-specific build scripts
- Vite preview commands

### Phase 5: Testing & Validation
**Timeline**: 2 hours  
**Priority**: Critical  

#### Test Checklist:
- [ ] Development server starts on port 8000
- [ ] Widget loads in dev environment
- [ ] Hot reload works (if implemented)
- [ ] Staging build completes successfully
- [ ] Production build completes successfully
- [ ] Bundle sizes are comparable or smaller
- [ ] No console logs in production build
- [ ] Source maps work in development
- [ ] All environments load correct API endpoints
- [ ] CSS styles apply correctly
- [ ] Images and SVGs load properly
- [ ] React DevTools work in development
- [ ] Performance benchmarks meet targets

#### Performance Targets:
- Dev build: < 100ms
- Production build: < 500ms
- Bundle size: < 150KB gzipped
- First contentful paint: < 500ms

### Phase 6: Cleanup & Documentation
**Timeline**: 1 hour  
**Priority**: Medium  

#### Tasks:
1. **Remove Vite dependencies**
   ```bash
   npm uninstall vite @vitejs/plugin-react vite-plugin-css-injected-by-js
   ```

2. **Delete Vite configuration files**
   - Remove `vite.config.js`
   - Remove any Vite-specific test configs

3. **Update documentation**
   - Update README.md build commands
   - Update CLAUDE.md with esbuild guidance
   - Document new build process
   - Update deployment scripts

4. **Create migration guide**
   - Document what changed
   - Provide rollback instructions
   - Note any breaking changes

## Risk Assessment & Mitigation

### Identified Risks:

1. **CSS Injection Differences**
   - Risk: CSS may load differently than with Vite plugin
   - Mitigation: Test thoroughly, keep fallback to separate CSS files

2. **Environment Variable Access**
   - Risk: Some code may depend on `import.meta.env` patterns
   - Mitigation: Comprehensive search and replace, thorough testing

3. **Bundle Size Changes**
   - Risk: Bundles may be larger without Rollup optimizations
   - Mitigation: Monitor sizes, implement code splitting if needed

4. **Development Experience**
   - Risk: No HMR may slow development
   - Mitigation: Fast rebuilds compensate, can add HMR later if needed

5. **CI/CD Pipeline**
   - Risk: Build commands change may break deployments
   - Mitigation: Update all deployment scripts before switchover

## Success Criteria

The migration will be considered successful when:

1. ✅ All three environments (dev/staging/prod) build successfully
2. ✅ Build times improve by at least 5x
3. ✅ Bundle sizes remain within 10% of current sizes
4. ✅ All existing tests pass
5. ✅ No regression in widget functionality
6. ✅ Deployment pipelines work without modification
7. ✅ Development server provides good DX
8. ✅ Documentation is fully updated

## Timeline Summary

| Phase | Description | Duration | Dependencies |
|-------|------------|----------|--------------|
| 1 | Environment Configuration | 2 hours | None |
| 2 | Feature Parity | 3 hours | Phase 1 |
| 3 | Code Migration | 1 hour | Phase 1 |
| 4 | Build Scripts | 1 hour | Phases 1-3 |
| 5 | Testing & Validation | 2 hours | Phases 1-4 |
| 6 | Cleanup & Documentation | 1 hour | Phase 5 |
| **Total** | **Complete Migration** | **10 hours** | - |

## Rollback Plan

If issues arise during migration:

1. **Immediate Rollback** (< 5 minutes)
   ```bash
   git checkout main
   npm install
   npm run dev
   ```

2. **Partial Rollback** (keep improvements)
   - Maintain esbuild for specific environments
   - Run Vite and esbuild in parallel temporarily

3. **Data Preservation**
   - Keep Vite config in `vite.config.js.backup`
   - Document all issues encountered
   - Create fix-forward plan

## Post-Migration Optimizations

After successful migration, consider:

1. **Performance Enhancements**
   - Implement watch mode with incremental builds
   - Add persistent caching
   - Optimize chunk splitting

2. **Developer Experience**
   - Add live reload (not full HMR)
   - Improve error messages
   - Add build notifications

3. **Advanced Features**
   - Implement plugin system if needed
   - Add advanced minification
   - Consider WebAssembly for critical paths

## Approval and Sign-off

- [ ] Technical Lead Review
- [ ] QA Team Validation
- [ ] DevOps Approval
- [ ] Final Go/No-Go Decision

---

**Next Steps**: 
1. Review and approve this plan
2. Create feature branch `feature/esbuild-migration`
3. Begin Phase 1 implementation
4. Schedule validation checkpoints after each phase