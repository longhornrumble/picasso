# File Uploads & Media Attachments PRD - Draft

## Executive Summary

This PRD explores adding file upload capabilities to the Picasso chat widget, with special consideration for compliance requirements in foster care contexts.

## Current State

- Upload icons exist in the UI (photo, document, camera)
- No backend functionality implemented
- No storage solution defined
- No compliance framework established

## Key Concerns & Open Questions

### 1. Compliance & Legal

**Foster Care Specific Issues:**
- **HIPAA**: Medical records, therapy notes, evaluations
- **FERPA**: Educational records, IEPs, report cards  
- **State Privacy Laws**: Foster children have additional protections
- **Court Orders**: Some documents may be sealed or restricted
- **Consent**: Who can consent to sharing a foster child's information?

**Questions to Answer:**
- Do we need different rules for different document types?
- Who is liable if sensitive information is shared inappropriately?
- What audit trail is required?
- How long can we store documents?
- What about cross-state regulations?

### 2. Use Cases to Consider

**Potential Valid Use Cases:**
- General forms (applications, non-sensitive documents)
- Proof of training certificates
- General correspondence
- Redacted documents
- Public information

**High-Risk Use Cases to Potentially Exclude:**
- Medical records
- Court documents
- Photos of children
- Case files
- Psychological evaluations

### 3. Technical Architecture Questions

**Storage:**
- Where do files go? (S3, but what bucket structure?)
- Encryption at rest and in transit?
- Access control and signed URLs?
- Retention policies and automatic deletion?

**Processing:**
- Virus scanning?
- File type restrictions?
- Size limits?
- Image processing (blur faces automatically?)
- Document sanitization?

**Integration:**
- Does the chatbot AI need to read these documents?
- How do documents flow to case workers?
- Integration with existing document management systems?
- Download/export capabilities?

### 4. User Experience Considerations

**Upload Flow:**
- What warnings/disclaimers are needed?
- Consent checkboxes?
- Clear indication of who will see the document?
- Ability to delete/retract uploads?

**Access Control:**
- Who can see uploaded documents?
- Different permissions for different user types?
- Time-based access (expires after X days)?

## Alternative Approaches to Consider

### Option 1: No Direct Uploads
- Instead of uploads, provide secure links to existing document systems
- Chatbot helps users understand what documents they need
- Directs them to appropriate secure portals

### Option 2: Limited Uploads with Heavy Restrictions
- Only allow specific document types (PDFs only?)
- Require document classification before upload
- Automatic redaction of sensitive information
- Short retention period (24-48 hours)

### Option 3: Integration-Only Approach  
- Don't store documents at all
- Pass through to existing compliant document management system
- Picasso acts as UI layer only

### Option 4: Phased Approach
- Phase 1: Document type education only (no uploads)
- Phase 2: Upload non-sensitive documents only
- Phase 3: Expand based on compliance review

## Risk Matrix

| Risk | Likelihood | Impact | Mitigation Strategy |
|------|------------|--------|-------------------|
| Sensitive data exposure | High | Critical | Strict file filtering, encryption, access controls |
| Compliance violation | Medium | Critical | Legal review, clear policies, audit trails |
| Storage costs | High | Medium | Retention limits, file size limits |
| Abuse/spam | Medium | Low | Rate limiting, user verification |

## Recommended Next Steps

1. **Legal Consultation**: 
   - Review with compliance team
   - Get clarity on foster care specific regulations
   - Define acceptable use policy

2. **Stakeholder Input**:
   - What documents do users actually need to share?
   - What's the current pain point?
   - Would links to existing systems suffice?

3. **Technical Proof of Concept**:
   - Implement virus scanning
   - Test encryption/decryption flow  
   - Build access control system

4. **Start Conservative**:
   - Begin with read-only document assistance
   - Add upload for only non-sensitive categories
   - Expand based on real usage and compliance clearance

## Cost Considerations

- **Storage**: S3 costs for documents
- **Processing**: Lambda functions for scanning/processing
- **Compliance**: Legal review, auditing systems
- **Development**: 2-3 months for basic system
- **Ongoing**: Monitoring, support, security updates

## Success Metrics

- Reduced support tickets about document questions
- Faster case processing times
- Zero compliance incidents
- User satisfaction scores

## Open Questions for Team

1. What specific documents are users trying to share today?
2. What happens to those documents currently?
3. Could we solve the problem without storing files?
4. What's our risk tolerance for this feature?
5. Do we have cyber insurance that covers data breaches?

---

*Note: This is a draft PRD focused on identifying concerns and questions rather than proposing solutions. The complexity of compliance in foster care contexts suggests starting with the most conservative approach possible.*