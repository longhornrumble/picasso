# Product Review: User Journey Analytics - Updated Assessment

**Document**: 1-Page PRD Format
**Review Date**: 2025-12-18
**Reviewer**: Product Management
**Status**: APPROVED with phased execution

---

## Problem

Nonprofits investing in MyRecruiter cannot answer their #1 question: **"Is my investment worth it?"**

**Two immediate pain points**:
1. **Forms Dashboard is MANDATORY**: The Lex-to-Picasso migration created a data obligation - nonprofits now provide structured form data and MUST see it presented professionally
2. **QA_COMPLETE logging is broken**: Messages go unaccounted (e.g., "20 conversations, 27 messages - where are the 7 missing messages?"), sessions can't be tied to outcomes, step-by-step journey is invisible

The Attribution Dashboard is the strategic value play - it makes the invisible visible and turns MyRecruiter from a cost center into a demonstrable ROI driver.

---

## Target Users

**Primary**: Nonprofit Executive Directors, Marketing Managers
**Secondary**: Volunteer Coordinators, Development Directors
**Capability**: Low-to-moderate technical sophistication, need actionable insights not raw data
**Context**: Monthly board reporting, fundraising justification, marketing optimization decisions

---

## Jobs to Be Done

When nonprofits use analytics dashboards, they want to:

1. **Justify subscription cost** - "Show my board that MyRecruiter drives 142 volunteer applications from 12,450 site visitors"
2. **Optimize marketing spend** - "Facebook drives 3.2x conversion vs organic - invest more there"
3. **Review form submissions** - "See who applied this week with searchable name/email/comments"
4. **Identify bottlenecks** - "Background Check field causes 38% drop-offs - add trust badge"
5. **Track traffic source ROI** - "Which campaigns drive actual outcomes, not just clicks?"

---

## Non-Functionals

- Dashboard loads <2s (hot data 0-30 days)
- 99% uptime during business hours (8am-8pm nonprofit timezone)
- Mobile-responsive (320px+ width)
- Tenant isolation (no data leakage between orgs)
- WCAG 2.1 AA accessibility compliance

---

## Out of Scope

**Not in MVP**:
- Real-time dashboard refresh (daily batch is sufficient)
- Conversations Dashboard enhancements (existing Bubble version stays)
- Inventory vs usage gap analysis (v2 optimization feature)
- Journey pattern detection (v2 advanced analytics)
- Export/PDF generation (manual screenshots work for now)
- Alert system (existing form webhook to Bubble handles notifications)
- Period-over-period comparison (v2 refinement)

**Separate Projects** (don't conflate with this work):
- Bubble conversations dashboard sunset (separate migration plan required)
- New React analytics app infrastructure (deferred - use Bubble auth + iframes initially)

---

## Acceptance Criteria

### Phase 1: Forms Dashboard (Weeks 1-2) - MANDATORY DELIVERY

1. Form funnel shows Views → Started → Completed with conversion % and abandon %
2. Recent submissions table displays name, email, form type, comments, date (searchable)
3. Top performing forms ranked by completion rate
4. Field bottleneck table shows which fields cause abandonment with counts
5. Average completion time displayed per form
6. Dashboard accessible via Bubble iframe (reuse existing auth, no new React app)
7. Data refreshes daily (no real-time requirement)
8. 3 pilot tenants validate usefulness before full rollout

**Success metric**: 80% of pilot tenants use weekly within 30 days

### Phase 2: Attribution Dashboard Core (Weeks 3-5) - STRATEGIC VALUE

9. Visitor funnel displays Site Visitors (manual input) → Widget Opened → Conversation Started → Form Completed with drop-off %
10. Conversion rate prominently displayed (form completions / site visitors)
11. UTM parameters captured from parent page URL and stored with session
12. Traffic source breakdown shows conversion rate per source (organic, social, direct, referral, unknown)
13. Top converting topics ranked by form completion rate (uses branch_id tracking)
14. Dashboard loads in <2s for 30-day queries
15. Tenant hash validation prevents cross-tenant data access
16. Date filter works (7/30/90 days)

**Success metric**: 3+ tenants adjust marketing based on data within 60 days

### Phase 3: GA4 Integration (Weeks 6-8) - AUTOMATION

17. GA4 OAuth consent screen approved by Google (start Week 1, unblocks Week 6)
18. Tenants can authorize GA4 access via Bubble UI
19. Site visitor count auto-populated from GA4 API (no manual input)
20. GA4 API errors handled gracefully (quota exceeded, invalid creds) with fallback to manual input
21. 80% of GA4-enabled tenants successfully connected within 30 days

**Success metric**: Zero manual data entry for 80% of active tenants

---

## Risks + Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Forms Dashboard unused** (HIGH) | Wasted 2 weeks | Pre-validate mockups with 3 tenants Week 0 |
| **GA4 OAuth approval delayed 4+ weeks** (MEDIUM) | Blocks Phase 3 | Start OAuth setup NOW (pre-Phase 1), have manual input fallback |
| **Customers don't use Attribution Dashboard** (HIGH) | Strategic failure | Ship Phase 1 first, validate usage before Phase 2 |
| **DynamoDB costs exceed budget** (MEDIUM) | Project overrun | Run cost projection with 1M/10M events, use S3 cold storage |
| **Session event schema changes mid-project** (LOW) | Rework queries | Lock schema Week 1, version all breaking changes |

---

## Success Metrics

### Phase 1 (Forms Dashboard) - 30 Days Post-Launch
- 80% of pilot tenants (3/3+) use dashboard weekly
- At least 1 tenant optimizes form based on bottleneck data
- Customer satisfaction score 8+/10 for usefulness

**Decision gate**: If <60% usage, STOP - re-evaluate need before Phase 2

### Phase 2 (Attribution Dashboard) - 60 Days Post-Launch
- 3+ tenants reference conversion rate in board reports or fundraising materials
- At least 2 tenants adjust marketing spend based on traffic source ROI
- Dashboard becomes part of monthly reporting workflow for 50%+ of users

**Decision gate**: If strategic value not demonstrated, pivot to Conversations Dashboard instead

### Phase 3 (GA4 Integration) - 90 Days Post-Launch
- 80% of GA4-enabled tenants successfully connected
- Zero manual data entry required for automated tenants
- GA4 data refresh runs daily without errors

---

## Phased Execution

### Pre-Work (Week 0)
- Customer discovery: Interview 3 tenants, validate Forms + Attribution mockups
- GA4 OAuth setup: Start Google Cloud project, consent screen approval process
- Schema lock: Finalize DynamoDB event schema, no changes mid-project

### Phase 1: Forms Dashboard (Weeks 1-2)
- Build Forms Dashboard ONLY (iframe in Bubble, reuse auth)
- Deploy DynamoDB tables (session-events, session-summaries)
- Instrument frontend (FORM_VIEWED, FORM_STARTED, FORM_COMPLETED, FORM_ABANDONED)
- Beta with 3 tenants, gather feedback

### Phase 2: Attribution Dashboard (Weeks 3-5)
- Build Attribution Dashboard (iframe in Bubble)
- Add UTM capture (widget-host.js reads parent URL params)
- Backend stores attribution with session
- Traffic source breakdown, conversion rate calculation
- Beta expansion to 10 tenants

### Phase 3: GA4 Integration (Weeks 6-8)
- GA4 Data API integration (site visitor auto-population)
- Multi-tenant OAuth credential storage
- Error handling (quota, invalid creds, fallback to manual)
- Full rollout to all active tenants

**Total Timeline**: 8 weeks (aggressive but achievable with locked scope)

---

## Recommendation

**APPROVED** with the following conditions:

1. **Customer validation FIRST** (Week 0) - Don't build blind
2. **Phase gates enforced** - Low usage in Phase 1 = STOP before Phase 2
3. **No scope creep** - Out-of-scope features deferred to v2 (no exceptions)
4. **Forms Dashboard is MANDATORY** - Non-negotiable delivery (Lex migration data obligation)
5. **Attribution Dashboard is STRATEGIC** - Core value proposition, must demonstrate ROI impact
6. **GA4 OAuth starts NOW** - Critical path blocker, don't wait for Week 6

**Confidence**: High - Business context now clear, phasing reduces risk, customer validation enforces evidence-based decisions

---

**Next Actions**:
- [ ] Schedule customer discovery calls with 3 tenants (this week)
- [ ] Start GA4 OAuth consent screen approval process (today)
- [ ] Lock DynamoDB event schema (Week 1 Day 1)
- [ ] Build Forms Dashboard mockup for validation (Week 0)

---

*Document prepared by: Product Management*
*Approval: Conditional (customer validation + phased gates)*
*Timeline Commitment: 8 weeks (2+3+3 phases)*
