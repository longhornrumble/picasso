# Web Config Builder - Product Requirements Document

**Version**: 1.0
**Date**: 2025-09-30
**Owner**: Product Management
**Status**: Ready for Review

---

## Problem Statement

Operations teams currently manage conversational forms through manual JSON editing, causing deployment delays, frequent errors, and scaling bottlenecks. With Phase 1 forms implementation complete, we lack the configuration tooling to deploy forms-enabled tenants at scale. This blocks revenue growth and creates operational risk.

**Target Users**: Internal operations team (primary), future customer self-service (secondary)

---

## Jobs-to-be-Done

1. **Deploy forms-enabled tenants** in under 10 minutes without technical expertise
2. **Create complex form structures** using templates and visual tools instead of JSON
3. **Validate configurations** before deployment to prevent widget breakage
4. **Maintain consistency** across multi-tenant deployments with reusable patterns

---

## Non-Functional Requirements

| Requirement | Target | Rationale |
|-------------|--------|-----------|
| Load time | <2s for config editor | Operational efficiency |
| Availability | 99.9% uptime | Critical business tool |
| Security | JWT auth + tenant isolation | Multi-tenant SaaS compliance |
| Browser support | Chrome, Firefox, Safari (latest 2 versions) | Operations team environment |
| Mobile support | Not required (desktop tool) | Workflow context |

---

## Out of Scope

- Customer-facing self-service (Phase 2 consideration)
- Real-time collaboration (multiple users editing simultaneously)
- Integration with Bubble.io admin UI (remains separate)
- Migration tools for existing manual configs
- Analytics/reporting on form performance

---

## Acceptance Criteria

**MVP (Phase 1) - 2 weeks**

1. User authenticates with Bubble JWT and sees tenant list
2. User loads existing base config from S3 (read-only display)
3. User creates new form with 5+ fields using manual field editor
4. User configures post-submission settings (message, actions, email fulfillment)
5. System validates config and shows specific errors before save
6. User deploys merged config to S3 successfully
7. Forms load and function correctly in production Picasso widget
8. Zero configuration-related errors in first 5 tenant deployments

**Templates (Phase 2) - 1 week**

9. User selects from 5+ pre-built form templates (volunteer, donation, contact, support, newsletter, event)
10. User customizes template fields and messaging
11. 80%+ of forms created use templates (measured after 20 tenant deployments)

**Visual Builder (Phase 3) - 2 weeks**

12. User drags fields from palette onto canvas to build form
13. Live preview iframe shows real-time form rendering
14. User creates CTAs and links them to forms visually
15. Validation dashboard highlights errors with fix suggestions

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Config corruption breaks production widgets** | Critical | Version control + rollback, strict validation before save |
| **S3 permission issues block deployments** | High | Least-privilege IAM policies, automated permission testing |
| **Poor UX leads to low adoption** | High | User testing with ops team, iterative feedback cycles |
| **Bubble JWT changes break authentication** | Medium | Abstract auth layer, monitor Bubble API changes |
| **Performance degrades with large configs** | Medium | Pagination, lazy loading, frontend optimization |

---

## Success Metrics

| Metric | Baseline | Target | Measurement Period |
|--------|----------|--------|-------------------|
| Time to deploy forms-enabled tenant | 60+ min (manual) | <10 min | First 90 days |
| Config validation error rate | 15% (estimated) | <1% | Ongoing |
| Template usage rate | 0% (no templates) | >80% | First 90 days |
| Config-related support tickets | 8/month (estimated) | <4/month | First 90 days |
| User satisfaction (ops team) | N/A | 4.5/5 | After 2 weeks of use |
| Tenants deployed with builder | 0 | 25+ | First 90 days |

---

## Technical Constraints

- Must integrate with existing Bubble.io tenant management system
- Must read/write configs from S3 bucket `myrecruiter-picasso`
- Must validate against existing Picasso config schema
- Must support Phase 1 forms implementation (post_submission config)
- Must work with existing `deploy_tenant_stack` Lambda
- Authentication via Bubble JWT (custom Lambda authorizer)

---

## Dependencies

**External Systems**:
- Bubble.io JWT authentication endpoint
- AWS S3 (config storage)
- AWS Lambda + API Gateway (backend)
- Existing Picasso widget (config consumer)

**Internal Prerequisites**:
- Forms Iteration 2 implementation complete (or parallel deployment)
- Config schema v1.2 documented (with post_submission structure)
- Bubble JWT format documented for validation
- Development AWS credentials and S3 access provisioned

---

## Go-to-Market Strategy

**Launch Approach**: Internal operations tool (no customer-facing launch)

**Rollout Plan**:
1. **Week 1-2**: Build MVP and test with 2 internal pilot tenants
2. **Week 3**: Add templates, train operations team (2-hour workshop)
3. **Week 4-5**: Build visual features, onboard 10 tenants
4. **Week 6+**: Advanced features, scale to 25+ tenants

**Training & Documentation**:
- User guide (step-by-step with screenshots)
- Video walkthrough (15-minute demo)
- API documentation (for future integrations)
- Troubleshooting guide

**Success Criteria for GA**:
- 5 tenants successfully deployed using builder
- Zero production incidents related to builder
- Operations team satisfaction rating >4/5
- All acceptance criteria met

---

**Approval**: [Product Manager], [Engineering Lead], [Operations Lead]
**Next Steps**: Engineering review → Sprint planning → Kickoff