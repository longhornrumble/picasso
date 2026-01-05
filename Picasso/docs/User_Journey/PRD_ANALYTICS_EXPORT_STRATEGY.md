# PRD: Analytics Dashboard Export Strategy

**Version:** 1.1
**Date:** 2025-12-27
**Status:** Approved (Architect Review Complete)
**Reviewed By:** System Architect Agent

---

## Problem

Users need to share analytics insights with stakeholders (boards, funders, clients) but the current CSV-only export has two critical gaps:

1. **Format mismatch**: Summary data (KPIs, charts, funnels) exports poorly to CSV - executives expect polished PDF reports
2. **Data scope ambiguity**: Users are confused whether CSV exports show filtered/paginated data or complete datasets

**Impact**: Nonprofit executives cannot demonstrate ROI to boards, account managers struggle to prove value to clients, and program managers lack presentation-ready reports for stakeholder meetings.

---

## Target Users

| User Persona | Primary Need | Export Use Case |
|--------------|--------------|-----------------|
| Nonprofit Executive | Prove ROI to board of directors | PDF summary report for quarterly board meeting |
| Marketing Manager | Optimize ad spend based on patterns | CSV conversation log for trend analysis |
| Program Manager | Improve form completion rates | PDF funnel visualization + CSV field-level data |
| Account Manager | Demonstrate value to clients | PDF client-facing analytics summary |

---

## Jobs to Be Done

**When** I need to share analytics insights with stakeholders,
**I want to** export dashboard data in the appropriate format for my audience,
**So that** I can make data-driven decisions and communicate impact effectively.

### Breakdown by Data Type

| Data Type | User Job | Preferred Format | Rationale |
|-----------|----------|------------------|-----------|
| Summary KPIs | "Show progress to board" | PDF | Polished, presentation-ready |
| Heatmap/Charts | "Identify staffing patterns" | PDF | Visual fidelity required |
| Funnels | "Diagnose drop-off points" | PDF | Step-by-step visualization |
| Sessions List | "Audit specific conversations" | CSV | Row-level analysis in Excel |
| Form Submissions | "Import into CRM" | CSV | Data integration |

---

## Non-Functional Requirements

- **Performance**: Export generation must complete within 10 seconds for datasets up to 1,000 rows
- **Accessibility**: Export buttons must be WCAG 2.1 AA compliant (keyboard navigation, screen reader support)
- **Security**: Exported files must respect tenant isolation (no data leakage across tenants)
- **Compatibility**: CSV exports must open correctly in Excel, Google Sheets, and Numbers
- **File Size**: PDF exports must be under 5MB for email-friendly sharing

---

## Out of Scope (Future Enhancements)

- **Scheduled exports**: Automated weekly/monthly email delivery
- **Custom templates**: User-defined PDF branding/logos
- **Excel format**: Native .xlsx export with formulas
- **Chart customization**: Interactive chart builder before export
- **Multi-tenant aggregation**: Cross-client comparison reports
- **API export**: Programmatic data access via REST endpoint

---

## Acceptance Criteria

### AC-1: Export Format Selection
**Given** I am viewing the Conversations Dashboard,
**When** I click the Export button,
**Then** I see a dropdown with options: "Export as PDF (Summary)" and "Export as CSV (Sessions)"

### AC-2: PDF Export - Conversations Dashboard
**Given** I select "Export as PDF (Summary)" on Conversations Dashboard,
**When** the export completes,
**Then** the PDF contains:
- Dashboard title and date range
- 4 KPI cards (Total Conversations, Total Messages, Avg Response Time, After Hours %)
- Conversation Heatmap (day/hour grid with peak indicator)
- Top 5 Questions (ranked list with percentages)
- Trend Chart (time series graph)
- Footer with export timestamp and tenant info

### AC-3: PDF Export - Forms Dashboard
**Given** I select "Export as PDF (Summary)" on Forms Dashboard,
**When** the export completes,
**Then** the PDF contains:
- Dashboard title and date range
- 4 KPI cards (Form Views, Completions, Completion Rate, Avg Time)
- Conversion Funnel (horizontal bar chart)
- Field Bottlenecks (top 5 drop-off points)
- Top Performing Forms (card grid with conversion rates)
- Footer with export timestamp

### AC-4: CSV Export - Sessions List
**Given** I select "Export as CSV (All Sessions)" on Conversations Dashboard,
**When** the export completes,
**Then** the CSV contains:
- All sessions for the selected date range (not just visible page)
- Columns: Session ID, Started At, First Question, Outcome, Message Count, Response Time
- UTF-8 encoding
- No row limit (up to 10,000 sessions)

### AC-5: CSV Export - Form Submissions
**Given** I select "Export as CSV (All Submissions)" on Forms Dashboard,
**When** the export completes,
**Then** the CSV contains:
- All submissions for the selected date range (not just visible page)
- Columns: Submission ID, Name, Email, Form Type, Date, Duration, Fields (JSON)
- Sensitive data warning in header comment
- No row limit (up to 10,000 submissions)

### AC-6: Export Respects Filters
**Given** I have filtered the dashboard by time range = "7d",
**When** I export data,
**Then** the export only includes data from the last 7 days (matching the visible dashboard)

### AC-7: Export Progress Indicator
**Given** I click an export button,
**When** the export is processing,
**Then** I see a loading spinner and "Generating export..." message
**And** the button is disabled until export completes or fails

### AC-8: Export Error Handling
**Given** the API returns an error during export,
**When** the export fails,
**Then** I see an error toast notification: "Export failed. Please try again."
**And** the export button is re-enabled

### AC-9: CSV Filename Convention
**Given** I export a CSV,
**When** the file downloads,
**Then** the filename follows the pattern: `{dashboard}_{type}_{tenant_id}_{date_range}_{timestamp}.csv`
**Example**: `conversations_sessions_MYR384719_7d_20251227.csv`

### AC-10: PDF Filename Convention
**Given** I export a PDF,
**When** the file downloads,
**Then** the filename follows the pattern: `{dashboard}_summary_{tenant_id}_{date_range}_{timestamp}.pdf`
**Example**: `conversations_summary_MYR384719_30d_20251227.pdf`

---

## Risks + Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Large datasets (10,000+ rows) cause browser freeze** | Medium | High | Implement server-side export generation via Lambda; stream results to S3 and return pre-signed URL |
| **PDF generation is slow (>10s)** | Medium | Medium | Use headless Chrome/Puppeteer in Lambda; cache chart images; pre-render components server-side |
| **Exported CSV has encoding issues (special characters)** | Low | Medium | Enforce UTF-8 BOM header; validate test cases with emoji, accents, and multilingual content |
| **Users export sensitive PII and share insecurely** | Medium | High | Add prominent warning in export UI; include disclaimer in PDF footer; log export events to audit trail |
| **Export button is not discoverable** | Low | Low | Place in PageHeader next to filters; add tooltip "Export current view"; include keyboard shortcut (Cmd+E) |
| **PDF charts render incorrectly (fonts, colors)** | Low | Medium | Use embedded base64 images; test across PDF viewers (Preview, Adobe, Chrome); match Tailwind color palette exactly |

---

## Success Metrics

### Leading Indicators (Week 1-2)
- **Export adoption rate**: 30% of active users click export within 7 days of launch
- **PDF vs CSV split**: 60% PDF, 40% CSV (validates format preference hypothesis)
- **Export completion rate**: 95% of export attempts succeed without error

### Lagging Indicators (Month 1-3)
- **Customer satisfaction**: 4.5/5 rating on "How useful are the export features?" survey
- **Support ticket reduction**: 50% decrease in "how do I share this data?" inquiries
- **Retention impact**: Users who export are 2x more likely to return weekly (proxy for value)
- **Upsell enablement**: Account managers report 40% faster client renewal conversations using PDF exports

### Technical Metrics
- **Export latency**: p95 < 8 seconds for datasets up to 1,000 rows
- **Error rate**: < 2% of export requests fail
- **Browser compatibility**: 0 reported bugs in Chrome, Safari, Firefox, Edge

---

## MVP Approach (Phase 1 - Week 1)

**Goal**: Validate core hypothesis that users prefer PDF for summaries and CSV for raw data.

### In Scope
- **PDF export**: Conversations Dashboard summary (KPIs + heatmap + top questions)
- **CSV export**: Sessions list (all data for date range, no pagination)
- **UI**: Single "Export" dropdown in PageHeader with 2 options
- **Client-side generation**: Use `react-pdf/renderer` for PDF (per Architect recommendation)

### Out of Scope
- Forms Dashboard exports (Phase 2)
- Server-side generation (Phase 2 if performance issues)
- Custom filters in export modal (just use current dashboard filters)
- Email delivery of exports

### Success Criteria
- Ship Conversations Dashboard exports in 2.5-3 days
- Ship Forms Dashboard exports in additional 1.5-2 days
- Gather qualitative feedback: "Does this solve your problem?"

---

## Future Enhancements (Phase 2+)

### Phase 2: Forms Dashboard Parity (Week 2)
- Add PDF export for Forms Dashboard (funnel + bottlenecks)
- Add CSV export for form submissions
- Implement server-side PDF generation if client-side is slow

### Phase 3: Advanced Filters (Month 2)
- Export modal with custom date range (override dashboard filter)
- Column selection for CSV exports
- Multi-form exports (compare 2+ forms side-by-side)

### Phase 4: Automation (Month 3)
- Scheduled exports (weekly email delivery)
- Webhook integration for CRM sync
- White-label PDF templates (custom logos, branding)

---

## Open Questions

1. **Should CSV exports include raw JSON payloads (e.g., `form_data_labeled`) or flatten into columns?**
   **Recommendation**: Flatten common fields (name, email, date) and include JSON as single `additional_fields` column

2. **Do we need Excel format (.xlsx) in MVP?**
   **Recommendation**: No - CSV is universally compatible; add .xlsx in Phase 3 if users request

3. **Should we limit export row count (e.g., max 10,000 rows)?**
   **Recommendation**: Yes - add soft limit with upgrade prompt for enterprise users who need more

4. **Do users need real-time export (instant download) or async + email delivery?**
   **Recommendation**: MVP = instant download; add async for datasets >1,000 rows in Phase 2

---

## Appendix: Technical Implementation Notes

### PDF Generation - Architect Recommendation

**Selected Approach**: `react-pdf/renderer` (client-side)

| Approach | Pros | Cons | Decision |
|----------|------|------|----------|
| **react-pdf/renderer** | Native React integration, component-based layouts, precise control, no DOM screenshots | ~250KB gzipped bundle size | ✅ **Selected for MVP** |
| **jsPDF + html2canvas** | Quick implementation | Rasterizes DOM (blurry), browser compatibility issues | ❌ Rejected |
| **Server-side (Puppeteer)** | Better for large datasets | Higher latency, Lambda layer complexity | ⏸️ Phase 2 fallback |

**Why react-pdf/renderer over jsPDF:**
- Better PDF quality (vector-based, not screenshot)
- React component model (easier to maintain)
- Consistent rendering across browsers
- Precise layout control for KPIs, tables, charts

**Bundle Size Consideration**: ~250KB gzipped. Acceptable for dashboard application. Consider lazy loading if size becomes an issue.

### CSV Generation
- **Library**: `papaparse` for client-side CSV generation
- **Encoding**: UTF-8 with BOM for Excel compatibility
- **Escape rules**: Double-quote fields with commas, newlines, or quotes
- **Headers**: Include column headers as first row

### Implementation Timeline (Architect Estimate)

| Task | Effort |
|------|--------|
| Install dependencies (`react-pdf/renderer`, `papaparse`) | 1 hour |
| Export dropdown UI component | 2-4 hours |
| PDF layout for Conversations Dashboard | 8-12 hours |
| CSV export for Sessions list | 4-6 hours |
| PDF layout for Forms Dashboard | 6-8 hours |
| Testing and polish | 4-6 hours |
| **Total MVP (Conversations)** | **2.5-3 days** |
| **Total Full Implementation** | **4-5 days** |

### Security Considerations (per Architect Review)
- **PII Audit Logging**: Log all export events with user ID and data scope
- **Rate Limiting**: Consider 5 exports/minute limit to prevent abuse
- **Data Scope**: Clarify whether export includes all data or just current page
- **Warning for PII**: Add prominent warning when exporting user data

### API Changes Required (Optional)
For datasets > 1,000 rows, consider:
- **New endpoint**: `GET /export/conversations?format=csv&range=7d`
- **Response**: For large datasets, return pre-signed S3 URL
- **Pagination override**: Export endpoints ignore `limit` param

**Note**: MVP uses existing API endpoints. New endpoints only needed if performance issues arise.

---

**Document Owner**: Chris Miller
**Reviewed By**: Product Manager Agent, System Architect Agent
**Status**: Approved for implementation
**Next Steps**: Begin MVP implementation (Conversations Dashboard PDF + CSV)
