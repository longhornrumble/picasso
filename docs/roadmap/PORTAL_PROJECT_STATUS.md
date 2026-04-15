# Portal Project — Status (as of 2026-04-07)

> Notifications are tracked separately in [NOTIFICATIONS_PORTAL_STATUS.md](NOTIFICATIONS_PORTAL_STATUS.md).

## Completed

### Config Builder Remediation
| Item | Status |
|------|--------|
| Dead field cleanup (17 fields removed) | Complete |
| V4_ACTION_SELECTOR flag added to UI | Complete |
| Active tenant flag (type, UI toggle, merge strategy, API filter) | Complete |
| Embed code settings panel | Complete |
| Create Tenant (renamed from Demo) | Complete |
| Notification settings panel (bubble_forwarding, from_email) | Complete |
| Fulfillment schema mismatch mapping | Complete (already existed) |
| Merge strategy: notification_settings, bubble_integration, active, organization_name | Complete |

### Clerk Auth
| Item | Status |
|------|--------|
| Analytics dashboard — Clerk trial (dev keys) | Complete |
| Config builder — Clerk production (live keys, HTTPS, Google SSO) | Complete |
| CloudFront for config builder (`config.myrecruiter.ai`, `E3OTEE0UFN347Y`) | Complete |
| Branded sign-in (emerald #50C878, Plus Jakarta Sans, 0.5rem radius) | Complete |
| White header + MyRecruiter logo + global font | Complete |

### Bubble Deplatforming (Phase 1)
| Item | Status |
|------|--------|
| Replace Bubble tenant list with S3 scan | Complete |
| Remove hardcoded Bubble API key (security fix) | Complete |
| Conditional form webhooks (no default Bubble URL) | Complete |
| Config builder as primary onboarding tool | Complete |
| Embed code in config builder | Complete |
| Deploy Master Function with conditional webhook | Complete |

### Tech Debt Cleanup
| Item | Status |
|------|--------|
| Athena removal — code (~580 lines across 2 Lambdas) | Complete |
| Athena removal — Lambda env vars | Complete |
| Athena removal — IAM roles (Athena/Glue permissions) | Complete |
| Athena removal — EventBridge rules (3 deleted) | Complete |
| Legacy analytics endpoints removed (4 handlers + helpers) | Complete |
| Legacy frontend API functions removed | Complete |
| Dashboard test suite green (93 tests) | Complete |

---

## Pending

### Uncommitted Work
| Repo | What |
|------|------|
| Dashboard | Legacy API function removal |
| Config builder | FeaturesSettings `dashboard_notifications` toggle |

### Not Started
| Item | Notes |
|------|-------|
| Clerk productionization | `portal-users` DynamoDB table, user management page, invite flow, webhooks |
| Portal UI cleanup | Awaiting review — dead ends and unbuilt features identified during testing |
| Merge to main | After Clerk productionization and UI cleanup |
| Phase 3 — Settings & Profile | On hold |

---

## Branch Map
| Repo | Dev Branch | Production |
|------|-----------|------------|
| picasso | `feature/portal` | `main` |
| lambda | `feature/portal` | `main` |
| config-builder | `feature/config-builder-v3.5-gaps` | — |

## Key Infrastructure
| Resource | ID/URL |
|----------|--------|
| Config builder CloudFront | `E3OTEE0UFN347Y` (`config.myrecruiter.ai`) |
| Config builder S3 | `picasso-config-builder-prod` |
| Config builder Clerk (prod) | `pk_live_Y2xlcmsubXlyZWNydWl0ZXIuYWkk` |
| Dashboard Clerk (dev) | `pk_test_Y2Fw...` (capable-peacock-51) |
| Config Manager | `Picasso_Config_Manager` Lambda |
