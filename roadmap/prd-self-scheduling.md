# 📋 PRD: Interview Self-Scheduling System

## **Product Overview**

**Project:** AI-powered interview scheduling directly through Picasso chat widget

**Goal:** Enable candidates to schedule interviews conversationally without leaving the chat interface

**Success Metrics:**
- 80% of scheduling attempts completed without human intervention
- <2 minutes average time to book interview
- 95% successful calendar sync rate
- Zero double-bookings

---

## **Problem Statement**

### **Current State**
- Recruiters manually coordinate interviews via email/phone
- High back-and-forth communication overhead
- Candidates drop off during lengthy scheduling processes
- Time zone confusion causes missed interviews

### **Solution**
Conversational AI that understands scheduling intent, checks real-time availability, and books interviews directly into recruiters' calendars.

---

## **User Flow**

### **Happy Path**
```
Bot: "I see you're interested in the Senior Developer position. Would you like to schedule an interview?"
User: "Yes, I'm free Tuesday afternoon"
Bot: "Great! I have slots at 2pm or 4pm EST on Tuesday. Which works better?"
User: "2pm works"
Bot: "Perfect! I've scheduled your interview for Tuesday at 2pm EST. You'll receive a confirmation email with the Zoom link."
```

### **Fallback Path**
```
Bot: "I don't see any times that match. Here's a link to view all available slots: [scheduling page]"
```

---

## **Technical Architecture**

### **Phase 1: Calendar Integration** (2-3 days)
- **Google Calendar API**
  - OAuth 2.0 flow
  - Read free/busy times
  - Create events with meeting links
- **Microsoft Graph API**
  - Azure AD authentication
  - Exchange calendar access
- **Timezone handling**
  - Auto-detect user timezone
  - Convert to recruiter timezone
  - Display in both zones

### **Phase 2: Lex Conversation Flow** (1-2 days)
- **Intent: ScheduleInterview**
  - Slots: date, time, duration
  - Confirmation required
- **Intent: RescheduleInterview**
  - Reference existing booking
  - Cancel and rebook
- **Intent: CancelInterview**
  - Soft delete with reason

### **Phase 3: Availability Engine** (2-3 days)
```javascript
class AvailabilityEngine {
  async findSlots(recruiterCalendar, candidatePreferences) {
    const busyTimes = await this.fetchBusyTimes(recruiterCalendar);
    const workingHours = await this.getWorkingHours(recruiterCalendar);
    const availableSlots = this.calculateAvailability(busyTimes, workingHours);
    return this.rankSlotsByPreference(availableSlots, candidatePreferences);
  }
}
```

### **Phase 4: Booking Flow** (1-2 days)
- **Confirmation UI**
  - Show in chat widget
  - Include meeting details
  - One-click confirm/decline
- **Calendar Event Creation**
  - Title: "[Interview] {Position} - {Candidate Name}"
  - Location: Zoom link (auto-generated)
  - Attendees: Recruiter + Candidate
  - Description: Interview details + preparation notes
- **Notifications**
  - Email confirmation to both parties
  - Calendar invites
  - SMS reminders (optional)

### **Phase 5: Edge Cases** (1 day)
- Calendar API failures → Queue for retry
- No matching availability → Scheduling page fallback
- Double-booking prevention → Pessimistic locking
- Timezone daylight savings → Use timezone library

---

## **MVP Scope** (3-5 days)

### **Included**
- Google Calendar only
- Single recruiter calendar
- Basic availability (no complex rules)
- Email confirmations
- Eastern/Pacific timezone support

### **Excluded**
- Multi-calendar coordination
- Rescheduling flow
- Team interviews
- Custom availability rules

---

## **Data Model**

```typescript
interface ScheduledInterview {
  id: string;
  candidateId: string;
  recruiterId: string;
  positionId: string;
  scheduledTime: DateTime;
  duration: number;
  timezone: string;
  meetingLink: string;
  calendarEventId: string;
  status: 'scheduled' | 'rescheduled' | 'cancelled';
  createdAt: DateTime;
  updatedAt: DateTime;
}
```

---

## **Success Metrics**

### **Efficiency Metrics**
- Time saved per scheduling: 15-30 minutes
- Reduction in email exchanges: 80%
- Scheduling completion rate: >75%

### **Quality Metrics**
- Correct timezone conversion: 100%
- Calendar sync success: >95%
- No-show rate reduction: 30%

### **Scale Metrics**
- Concurrent scheduling capacity: 100+
- API rate limit headroom: 50%
- Response time: <2 seconds

---

## **Risks & Mitigation**

### **Technical Risks**
- **Risk**: Calendar API rate limits
- **Mitigation**: Implement caching and request batching

- **Risk**: OAuth token expiration
- **Mitigation**: Automatic refresh token rotation

### **Business Risks**
- **Risk**: Candidates uncomfortable with AI scheduling
- **Mitigation**: Always offer human fallback option

---

## **Future Enhancements**

1. **Multi-participant scheduling** - Coordinate panel interviews
2. **Smart rescheduling** - AI suggests optimal reschedule times
3. **Interview prep bot** - Sends tips based on position
4. **Feedback collection** - Post-interview survey automation
5. **Analytics dashboard** - Show scheduling efficiency metrics

---

**Total Estimate: 7-11 days** (Full system)  
**MVP Estimate: 3-5 days** (Basic functionality)  
**Impact: Transforms Picasso from chatbot to AI recruiting assistant**