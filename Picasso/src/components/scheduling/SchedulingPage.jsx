/**
 * SchedulingPage — the branded full-page scheduling surface (M1a).
 *
 * Where it runs: iframe-main mounts this (instead of <ChatWidget/>) when the iframe URL
 * carries ?mode=schedule. It lives INSIDE the existing provider tree (ConfigProvider →
 * CSSVariablesProvider → ChatProviderOrchestrator), so per-tenant branding (CSS vars from
 * useCSSVariables) and the streaming chat (useChat) are already wired.
 *
 * What it does: fixes the email reschedule/cancel dead-end. The redemption handler binds
 * the §B10 session and redirects here as /schedule/?t=<hash>&session=<id>&purpose=<p>.
 * The page reuses the EXISTING streaming flow + binding — there is no new executor: the
 * §B18 components send the same deterministic signals, the agent runs the bound
 * reschedule/cancel turn, and executeReschedule/executeCancel commit at the §B14 boundary.
 *
 * Layout (operator-locked design): a guided picker HERO (daypart quick-pick chips →
 * concrete time rows, or "Pick a specific date" → a month calendar) + a COMPANION CHAT
 * row below (questions only — the picker owns slot/confirm rendering, the companion
 * renders message text only, so nothing double-renders).
 *
 * Hero context is forward-compatible: it consumes a `schedulingBookingSummary` (current
 * appointment + appt-type label) IF present (populated later by M1a.2's
 * scheduling_booking_summary SSE), and the `schedulingContext` line (duration · channel ·
 * tz) that the existing scheduling_slots event already carries. Absent → a clean generic
 * hero (schema discipline — never crash on a missing field).
 */

import React, { useMemo, useState } from 'react';
import { useConfig } from '../../context/ConfigProvider.jsx';
import { useChat } from '../../hooks/useChat';
import SchedulingSlots, {
  SchedulingConfirmCard,
  SchedulingNotice,
  buildContextLine,
} from '../chat/SchedulingSlots.jsx';
import SchedulingMonthCalendar from './SchedulingMonthCalendar.jsx';
// NOTE: schedule-page.css is imported at the entry (iframe-main.jsx), alongside the
// other global stylesheets — matches the codebase convention and keeps this component
// CSS-import-free (so component tests don't depend on the css moduleNameMapper).

// purpose (from the redemption redirect) → page framing.
const PURPOSE_COPY = {
  reschedule: { pill: 'Reschedule', verb: 'Reschedule', prompt: 'What time would work better?' },
  cancel: { pill: 'Cancel', verb: 'Cancel', prompt: 'Need to cancel this appointment?' },
  new: { pill: 'Book', verb: 'Book', prompt: 'When works best for you?' },
};

// Generic daypart refinements. These are sent as NATURAL LANGUAGE — the agent interprets
// them and calls get_available_times with the right bounds (the §B18c microcopy already
// invites "just tell me what does — like 'Thursday afternoon.'"). No bogus deterministic
// signal is attached; only true §B18 actions (select_slot / day_selected) carry metadata.
const DAYPARTS = [
  { key: 'morning', label: 'Mornings', message: 'Do you have any morning times?' },
  { key: 'afternoon', label: 'Afternoons', message: 'Do you have any afternoon times?' },
  { key: 'nextweek', label: 'Next week', message: 'What about next week?' },
  { key: 'calendar', label: 'Pick a specific date' },
];

function getQueryParam(name) {
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}

// Newest-wins read of a scheduling metadata field across the message list.
function latestMeta(messages, key) {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const v = messages[i] && messages[i].metadata && messages[i].metadata[key];
    if (v != null) return v;
  }
  return null;
}

function initialsOf(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '·';
}

export default function SchedulingPage() {
  const { config } = useConfig();
  const { messages = [], sendMessage, isTyping } = useChat();

  const purpose = (getQueryParam('purpose') || 'new').toLowerCase();
  const copy = PURPOSE_COPY[purpose] || PURPOSE_COPY.new;

  const [activeDaypart, setActiveDaypart] = useState(null);
  const [chatOpen, setChatOpen] = useState(true);
  const [input, setInput] = useState('');

  const branding = config?.branding || {};
  const orgName = config?.chat_title || branding.chat_title || 'Scheduling';
  const logoUrl = branding.logo_url || branding.avatar_url || '';
  const initials = useMemo(() => initialsOf(orgName), [orgName]);

  // Forward-compatible hero context (M1a.2 SSE populates schedulingBookingSummary).
  const summary = latestMeta(messages, 'schedulingBookingSummary') || {};
  const apptLabel = summary.appointment_label || 'your appointment';
  const schedulingContext = latestMeta(messages, 'schedulingContext');
  const contextLine = buildContextLine(schedulingContext);

  // SSE-driven scheduling affordances (newest message wins).
  const slots = latestMeta(messages, 'schedulingSlots');
  const confirm = latestMeta(messages, 'schedulingConfirm');
  const notice = latestMeta(messages, 'schedulingNotice');

  const title = `${copy.verb} ${apptLabel}`;

  const handleDaypart = (dp) => {
    setActiveDaypart(dp.key);
    if (dp.key === 'calendar') return; // calendar renders inline; no message yet
    if (dp.message && !isTyping) sendMessage(dp.message);
  };

  const handleDaySelected = (date, label) => {
    if (!isTyping) sendMessage(label, { scheduling_day_selected: date });
  };

  const handleCancelConfirm = () => {
    if (!isTyping) sendMessage('Yes, please cancel my appointment.');
  };

  const handleChatSend = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const v = input.trim();
    if (!v || isTyping) return;
    setInput('');
    sendMessage(v);
  };

  // Companion chat: message TEXT only — the picker owns slot/confirm rendering.
  const chatBubbles = messages.filter((m) => (m.content || '').trim().length > 0);

  return (
    <div className="sched-page" data-purpose={purpose}>
      <header className="sched-brand">
        {logoUrl
          ? <img className="sched-logo-img" src={logoUrl} alt="" />
          : <div className="sched-logo">{initials}</div>}
        <div className="sched-brand-text">
          <div className="sched-org">{orgName}</div>
          <div className="sched-tag">Scheduling</div>
        </div>
        <div className="sched-secure">🔒 Secure link</div>
      </header>

      <main className="sched-wrap">
        {/* HERO — guided picker */}
        <section className="sched-panel sched-picker">
          <span className="sched-pill">{copy.pill}</span>
          <h1 className="sched-title">{title}</h1>
          {summary.current_start_label && (
            <p className="sched-current">
              Current appointment: <b>{summary.current_start_label}</b>
            </p>
          )}
          {contextLine && <div className="sched-metarow">{contextLine}</div>}

          <div className="sched-prompt">{copy.prompt}</div>

          {purpose === 'cancel' ? (
            <div className="sched-cancel">
              <button
                type="button"
                className="sched-cta sched-cta-danger"
                disabled={isTyping}
                onClick={handleCancelConfirm}
              >
                Cancel Appointment
              </button>
              <span className="sched-hint">You can also pick a new time instead — just ask below.</span>
              {notice && <SchedulingNotice notice={notice} />}
            </div>
          ) : (
            <>
              <div className="sched-chips">
                {DAYPARTS.map((dp) => (
                  <button
                    key={dp.key}
                    type="button"
                    className={`sched-chip${activeDaypart === dp.key ? ' on' : ''}`}
                    disabled={isTyping}
                    onClick={() => handleDaypart(dp)}
                  >
                    {dp.label}
                  </button>
                ))}
              </div>

              <div className="sched-results">
                {activeDaypart === 'calendar' && (
                  <SchedulingMonthCalendar
                    onSelectDay={handleDaySelected}
                    config={config}
                    disabled={isTyping}
                  />
                )}
                {/* concrete time rows — §B18 SchedulingSlots, restyled to rows via CSS.
                    schedulingContext is shown in the hero metarow, so don't double-render it. */}
                {Array.isArray(slots) && slots.length > 0 && (
                  <SchedulingSlots slots={slots} />
                )}
                {confirm && confirm.slot && <SchedulingConfirmCard confirm={confirm} />}
                {notice && <SchedulingNotice notice={notice} />}
                {isTyping && <div className="sched-typing">Finding times…</div>}
                {!isTyping && (!Array.isArray(slots) || slots.length === 0) && !activeDaypart && (
                  <p className="sched-empty">Pick an option above to see available times.</p>
                )}
              </div>
            </>
          )}
        </section>

        {/* COMPANION CHAT — questions only */}
        <section className={`sched-panel sched-companion${chatOpen ? '' : ' collapsed'}`}>
          <button type="button" className="sched-chead" onClick={() => setChatOpen((o) => !o)}>
            <div className="sched-ava">{initials}</div>
            <div className="sched-brand-text">
              <div className="sched-ct">Have a question?</div>
              <div className="sched-cs">
                Chat with the {orgName} team — we won&rsquo;t change your time unless you ask.
              </div>
            </div>
            <span className="sched-chev">▾</span>
          </button>
          <div className="sched-cbody">
            {chatBubbles.length === 0 ? (
              <div className="sched-msg bot">
                Ask anything about your appointment — what to expect, the location, or who
                you&rsquo;ll meet. Use the options above to actually change the time.
              </div>
            ) : (
              chatBubbles.map((m) => (
                <div key={m.id} className={`sched-msg ${m.role === 'user' ? 'user' : 'bot'}`}>
                  {m.content}
                </div>
              ))
            )}
          </div>
          <form className="sched-cfoot" onSubmit={handleChatSend}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question…"
              disabled={isTyping}
              aria-label="Ask a question"
            />
            <button type="submit" disabled={isTyping || !input.trim()} aria-label="Send">➤</button>
          </form>
        </section>
      </main>
    </div>
  );
}
