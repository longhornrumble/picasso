# User Journey Analytics - Product Requirements Document

**Version:** 1.0
**Date:** 2025-12-18
**Status:** Draft

---

## Related Documents

| Document | Purpose |
|----------|---------|
| [USER_JOURNEY_ANALYTICS_PLAN.md](USER_JOURNEY_ANALYTICS_PLAN.md) | Technical implementation plan (architecture, schemas, APIs, phased rollout) |
| [ANNEX_C_FORMS_DASHBOARD.md](ANNEX_C_FORMS_DASHBOARD.md) | Forms Dashboard build specification |

---

## Problem

Nonprofits ask "Is my investment in MyRecruiter worth it?" and we cannot answer. After migrating from Amazon Lex to Picasso native forms, structured data is invisible to clients. Attribution tracking does not exist. Conversation insights are fragmented in CloudWatch logs. Without visibility into ROI, clients will churn.

---

## Target Users

- **Nonprofit Executives**: Prove ROI to board of directors
- **Marketing Managers**: Optimize ad spend by identifying high-converting traffic sources
- **Program Managers**: Improve form completion rates by fixing bottlenecks
- **MyRecruiter Account Managers**: Demonstrate value to reduce churn

---

## Jobs-to-be-Done

1. **Prove ROI**: Show complete funnel from site visits to form completions with estimated value generated
2. **Optimize spend**: Identify which traffic sources (Facebook, organic, paid) convert best
3. **Fix bottlenecks**: Discover which form fields cause drop-offs with actionable recommendations
4. **Understand users**: See what questions are asked, conversation depth, session outcomes
5. **Track engagement**: Measure link clicks, CTA performance, content resonance

---

## Non-Functionals

| Requirement | Target |
|-------------|--------|
| **Security** | Multi-tenant isolation via forced tenant_id injection (JWT authorizer), penetration tested |
| **Performance** | API <500ms p90, Dashboard <2s load |
| **Scale** | Support 100+ tenants, 100k events/month |
| **Reliability** | >99.9% event capture (SQS buffer + DLQ) |
| **Privacy** | Full content stored, tenant-authorized access only, RBAC |

---

## Out-of-Scope

- Real-time streaming dashboards (daily batch sufficient)
- Predictive analytics or ML models
- Mobile native app (desktop-first, responsive web)
- Custom report builder (fixed dashboards only)
- Non-GA4 analytics integrations
- Historical data backfill (start fresh)

---

## Acceptance Criteria

1. Forms Dashboard shows conversion funnel (Views → Started → Completed) with field bottleneck analysis
2. Conversations Dashboard shows Q&A pairs, session reconstruction, conversation depth distribution
3. Multi-tenant security validated via penetration testing (zero vulnerabilities)
4. API latency <500ms p90 for DynamoDB queries
5. Event capture success rate >99.9% over 7-day period
6. 3 pilot tenants using dashboards for 2 weeks with zero critical bugs
7. CSV export functional for form submissions and conversation data
8. Bubble JWT authentication integrated with seamless SSO
9. Dashboard loads <2s on desktop (3G throttled)
10. Insight callouts auto-generate for field bottlenecks
11. Attribution Dashboard (v2.0) shows GA4 site visits → widget sessions → conversions
12. DynamoDB tables created with 90-day TTL and proper GSIs

---

## Risks + Mitigations

| Risk | Mitigation |
|------|------------|
| **tenant_id injection vulnerability** | API Gateway Lambda Authorizer forces tenant_id from JWT; penetration testing; security code review |
| **Forms Dashboard delayed → churn** | Prioritize in MVP (Weeks 5-6); mandatory post-Lex migration |
| **GA4 stitching accuracy <85%** | Client_id cookie approach; fallback fingerprinting; set expectations upfront |
| **Event loss during Lambda failures** | SQS buffer + DLQ; replay failed events; CloudWatch alarms on DLQ depth |
| **Low GA4 adoption by tenants** | Make GA4 optional; show value with Forms/Conversations first; simple onboarding guide |
| **Performance degrades at scale** | Start with DynamoDB; defer to Athena when needed; React Query caching |

---

## Success Metrics

**Primary (Customer Success):**
- 80%+ customers agree "MyRecruiter is worth it" (NPS survey 90 days post-launch)
- 60%+ tenants check dashboards weekly
- 3+ actionable insights auto-generated per tenant per month
- <5 minutes from login to "aha moment"

**Secondary (Technical):**
- API latency <500ms p90
- Event capture >99.9% success rate
- Zero security vulnerabilities (penetration testing)
- Dashboard uptime 99.5%+

**Lagging (Business):**
- +20% YoY new tenant signups
- +15% YoY average contract value
- -10% sales cycle length
- <5 support tickets/month re: analytics

---

## Implementation Phases

**MVP (6 weeks):** Forms Dashboard + Conversations Dashboard

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Phase 1: Event Capture | Weeks 1-2 | Event system, DynamoDB tables, SQS buffer |
| Phase 2: Analytics API | Weeks 3-4 | JWT auth, query routing, tenant isolation |
| Phase 5: Forms + Conversations | Weeks 5-6 | Two dashboards deployed to 3 pilot tenants |
| Phase 6: Polish + Launch | Week 7 | Production deployment, Bubble sunset |

**v2.0 (defer):** Attribution Dashboard with GA4 integration

---

## Annexes

- **[ANNEX_A_ATTRIBUTION_DASHBOARD.md](ANNEX_A_ATTRIBUTION_DASHBOARD.md)** - Visitor journey funnel, traffic source ROI (v2.0)
- **[ANNEX_B_CONVERSATIONS_DASHBOARD.md](ANNEX_B_CONVERSATIONS_DASHBOARD.md)** - Q&A metrics, heat maps, session reconstruction
- **[ANNEX_C_FORMS_DASHBOARD.md](ANNEX_C_FORMS_DASHBOARD.md)** - Form funnel, field bottlenecks, submissions (MVP PRIORITY)
