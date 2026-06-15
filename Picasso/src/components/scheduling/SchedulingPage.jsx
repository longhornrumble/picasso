/**
 * SchedulingPage — the branded full-page scheduling surface (M1, Calendly-style).
 *
 * Mounted by iframe-main when ?mode=schedule. Lives inside the existing provider tree
 * (ConfigProvider → CSSVariablesProvider → ChatProviderOrchestrator), so per-tenant
 * branding (CSS vars from useCSSVariables) and the streaming chat (useChat) are wired.
 *
 * TWO SEPARATE PATHS (operator design 2026-06-14):
 *   • The SCHEDULER (deterministic): "Choose a Day" quick buttons + a "Pick a date"
 *     calendar → that day's available TIMES (from the Scheduling_Page_Api gateway, which
 *     resolves the §B10 binding + calls BCH propose) → pick a time → Confirm → the gateway
 *     commits (reschedule/cancel). No chat round-trip. Slots live in LOCAL state.
 *   • The COMPANION CHAT (conversational): the full agent chat — questions ("what should I
 *     bring?") AND conversational scheduling ("any times on the 24th?") still work exactly
 *     as today (SSE → message.metadata → rendered here). Kept SEPARATE from the picker
 *     (picker = gateway/local-state, chat = SSE/metadata) so the two never double-render.
 *
 * The hero shows the CURRENT appointment ("Current appointment: Sunday, June 15 · 10:30 AM
 * CDT") from the gateway's propose response (booking summary), on load.
 *
 * Identity: reschedule/cancel reuse the bound attendee (no form). New-booking + the
 * name/phone/email step is M2.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useConfig } from '../../context/ConfigProvider.jsx';
import { useChat } from '../../hooks/useChat';
import { proposeTimes, mutateBooking } from '../../utils/schedulingGateway';
import SchedulingMonthCalendar from './SchedulingMonthCalendar.jsx';
import SchedulingSlots, {
  SchedulingConfirmCard,
  SchedulingNotice,
} from '../chat/SchedulingSlots.jsx';
import { sanitizeHTML } from '../../utils/security';

const PURPOSE = {
  reschedule: { pill: 'Reschedule', verb: 'Reschedule' },
  cancel: { pill: 'Cancel', verb: 'Cancel' },
  new: { pill: 'Book', verb: 'Book' },
};

function qp(name) {
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}
function initialsOf(name) {
  return (
    String(name || '')
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '·'
  );
}
function isoOf(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
function dayLabel(d) {
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function dayLabelFromIso(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return dayLabel(new Date(y, m - 1, d));
}
// next N weekdays (skip Sat/Sun), starting tomorrow.
function nextWeekdays(n) {
  const out = [];
  const d = new Date();
  let guard = 0;
  while (out.length < n && guard++ < 30) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) out.push(new Date(d));
  }
  return out;
}
function formatCurrent(startAt, tz) {
  if (!startAt) return null;
  try {
    const d = new Date(startAt);
    if (isNaN(d.getTime())) return null;
    const date = d.toLocaleDateString(undefined, {
      weekday: 'long', month: 'long', day: 'numeric', timeZone: tz || undefined,
    });
    const time = d.toLocaleTimeString(undefined, {
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: tz || undefined,
    });
    return `${date} · ${time}`;
  } catch {
    return null;
  }
}

export default function SchedulingPage() {
  const { config } = useConfig();
  const { messages = [], sendMessage, isTyping } = useChat();

  const tenantHash = qp('t');
  const session = qp('session');
  const purpose = (qp('purpose') || 'new').toLowerCase();
  const copy = PURPOSE[purpose] || PURPOSE.new;
  const isCancel = purpose === 'cancel';

  const branding = config?.branding || {};
  const orgName = config?.chat_title || branding.chat_title || 'Scheduling';
  const logoUrl = branding.logo_url || branding.avatar_url || '';
  const ini = useMemo(() => initialsOf(orgName), [orgName]);

  const quickDays = useMemo(
    () => nextWeekdays(3).map((d) => ({ iso: isoOf(d), label: dayLabel(d) })),
    []
  );
  const [selectedDay, setSelectedDay] = useState(quickDays[0]?.iso || null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [summary, setSummary] = useState(null);
  const [times, setTimes] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [confirmError, setConfirmError] = useState(null); // UX-1: errors from the commit step
  const [done, setDone] = useState(null);
  const [companionOpen, setCompanionOpen] = useState(true);
  const [chatInput, setChatInput] = useState('');
  const reqIdRef = useRef(0); // RACE-1: ignore stale day-load responses

  const apptLabel = summary && summary.appointment_label;
  const heroTitle = apptLabel ? `${copy.verb} Your ${apptLabel}` : `${copy.verb} your appointment`;
  const currentLine = summary && formatCurrent(summary.current_start_at, summary.timezone);

  async function loadDay(dateIso) {
    if (!tenantHash || !session) {
      setError('missing_link');
      return;
    }
    const id = ++reqIdRef.current; // RACE-1: only the newest day-load wins
    setLoading(true);
    setError(null);
    setSelectedSlot(null);
    try {
      const r = await proposeTimes({ tenantHash, session, date: isCancel ? undefined : dateIso });
      if (id !== reqIdRef.current) return; // a later day-click superseded this response
      setSummary({
        appointment_label: r.appointment_label,
        current_start_at: r.current_start_at,
        timezone: r.timezone,
      });
      setTimes(Array.isArray(r.slots) ? r.slots : []);
      // ERR-1: a backend failure must read as an error, not "no open times that day".
      if (r.outcome === 'failed') setError('load_failed');
    } catch (e) {
      if (id !== reqIdRef.current) return;
      setError((e && (e.code || e.message)) || 'load_failed');
      setTimes([]);
    } finally {
      if (id === reqIdRef.current) setLoading(false);
    }
  }

  // Mount-only: load the booking summary (+ first day's times in reschedule mode).
  useEffect(() => {
    if (isCancel) loadDay(null);
    else if (selectedDay) loadDay(selectedDay);
  }, []); // eslint-disable-line

  const pickQuickDay = (iso) => {
    setSelectedDay(iso);
    setShowCalendar(false);
    loadDay(iso);
  };
  const pickCalendarDay = (iso) => {
    setSelectedDay(iso);
    setShowCalendar(false); // CAL-1: collapse the calendar once a day is chosen
    loadDay(iso);
  };

  const confirmReschedule = async () => {
    if (!selectedSlot) return;
    setLoading(true);
    setConfirmError(null);
    try {
      const r = await mutateBooking({
        tenantHash, session, mutation: 'reschedule',
        newSlot: { start: selectedSlot.start, end: selectedSlot.end },
      });
      if (r.outcome === 'success' || r.outcome === 'pending_calendar_sync') setDone('rescheduled');
      else setConfirmError('failed');
    } catch (e) {
      // UX-1: a failed commit MUST surface (the user must not think it worked). A 401 means
      // the 30-min link expired; clear the slot so they don't re-fire the same mutation.
      setConfirmError((e && e.code) === 'unauthorized' ? 'expired' : 'failed');
      setSelectedSlot(null);
    } finally {
      setLoading(false);
    }
  };
  const confirmCancel = async () => {
    setLoading(true);
    setConfirmError(null);
    try {
      const r = await mutateBooking({ tenantHash, session, mutation: 'cancel' });
      if (r.outcome === 'deleted' || r.outcome === 'pending_calendar_sync') setDone('canceled');
      else setConfirmError('failed');
    } catch (e) {
      setConfirmError((e && e.code) === 'unauthorized' ? 'expired' : 'failed');
    } finally {
      setLoading(false);
    }
  };

  const confirmErrorMsg =
    confirmError === 'expired'
      ? 'This link has expired — please reopen the link from your email.'
      : 'Something went wrong — please try again.';

  const chatSend = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const v = chatInput.trim();
    if (!v || isTyping) return;
    setChatInput('');
    sendMessage(v);
  };

  // Companion = the full agent chat: text + any §B18 scheduling components the agent emits
  // (conversational scheduling stays alive). Picker slots live in LOCAL state, so no collision.
  const chatBubbles = messages.filter(
    (m) =>
      (m.content || '').trim().length > 0 ||
      (m.metadata && (m.metadata.schedulingSlots?.length || m.metadata.schedulingConfirm?.slot || m.metadata.schedulingNotice))
  );

  const selectedDayLabel = selectedDay ? dayLabelFromIso(selectedDay) : '';

  return (
    <div className="sched-page" data-purpose={purpose}>
      <header className="sched-brand">
        {logoUrl ? <img className="sched-logo-img" src={logoUrl} alt="" /> : <div className="sched-logo">{ini}</div>}
        <div className="sched-brand-text">
          <div className="sched-org">{orgName}</div>
          <div className="sched-tag">Scheduling</div>
        </div>
        <div className="sched-secure">🔒 Secure link</div>
      </header>

      <main className="sched-wrap">
        <section className="sched-panel sched-picker">
          {done ? (
            <div className="sched-done">
              <div className={`sched-done-check${done === 'canceled' ? ' cancel' : ''}`}>✓</div>
              <h1 className="sched-done-title">{done === 'canceled' ? 'Appointment cancelled' : "You're rescheduled"}</h1>
              <p className="sched-current">
                {done === 'canceled'
                  ? 'The team has been notified. You can book again anytime.'
                  : 'A confirmation and calendar invite are on their way to your inbox.'}
              </p>
            </div>
          ) : (
            <>
              <span className="sched-pill">{copy.pill}</span>
              <h1 className="sched-title">{heroTitle}</h1>
              {currentLine && (
                <p className="sched-current">Current appointment: <b>{currentLine}</b></p>
              )}

              {isCancel ? (
                <div className="sched-cancel">
                  <button type="button" className="sched-cta sched-cta-danger" disabled={loading} onClick={confirmCancel}>
                    {loading ? 'Cancelling…' : 'Cancel Appointment'}
                  </button>
                  <span className="sched-hint">Changed your mind? Just close this page — nothing happens until you confirm.</span>
                  {confirmError && <p className="sched-error" role="alert">{confirmErrorMsg}</p>}
                </div>
              ) : (
                <>
                  <div className="sched-section-label">Choose a Day</div>
                  <div className="sched-chips">
                    {quickDays.map((d) => (
                      <button
                        key={d.iso}
                        type="button"
                        className={`sched-chip${selectedDay === d.iso && !showCalendar ? ' on' : ''}`}
                        disabled={loading}
                        onClick={() => pickQuickDay(d.iso)}
                      >
                        {d.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      className={`sched-chip${showCalendar ? ' on' : ''}`}
                      disabled={loading}
                      onClick={() => setShowCalendar((s) => !s)}
                    >
                      Pick a date
                    </button>
                  </div>

                  {showCalendar && (
                    <SchedulingMonthCalendar onSelectDay={pickCalendarDay} config={config} disabled={loading} />
                  )}

                  <div className="sched-section-label sched-times-label">
                    Available Times{selectedDayLabel ? ` · ${selectedDayLabel}` : ''}
                  </div>
                  {loading ? (
                    <p className="sched-typing">Finding times…</p>
                  ) : times.length > 0 ? (
                    <div className="sched-timelist">
                      {times.map((s) => (
                        <button
                          key={s.slotId || s.start}
                          type="button"
                          className={`sched-time${selectedSlot && (selectedSlot.slotId || selectedSlot.start) === (s.slotId || s.start) ? ' sel' : ''}`}
                          onClick={() => setSelectedSlot(s)}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="sched-empty">
                      {error ? 'We couldn’t load times — try another day or ask below.' : 'No open times that day — try another day or “Pick a date.”'}
                    </p>
                  )}

                  <div className="sched-confirmbar">
                    <button type="button" className="sched-cta" disabled={!selectedSlot || loading} onClick={confirmReschedule}>
                      Confirm New Time
                    </button>
                    {selectedSlot && <span className="sched-hint">Selected: <b>{selectedSlot.label}</b></span>}
                  </div>
                  {confirmError && <p className="sched-error" role="alert">{confirmErrorMsg}</p>}
                </>
              )}
            </>
          )}
        </section>

        {/* COMPANION CHAT — full agent chat (questions + conversational scheduling). */}
        <section className={`sched-panel sched-companion${companionOpen ? '' : ' collapsed'}`}>
          <button type="button" className="sched-chead" onClick={() => setCompanionOpen((o) => !o)}>
            <div className="sched-ava">{ini}</div>
            <div className="sched-brand-text">
              <div className="sched-ct">Have a question?</div>
              <div className="sched-cs">Ask the {orgName} team anything about your appointment.</div>
            </div>
            <span className="sched-chev">▾</span>
          </button>
          <div className="sched-cbody">
            {chatBubbles.length === 0 ? (
              <div className="sched-msg bot">
                Ask anything about your appointment — what to expect, the location, or who you&rsquo;ll meet.
              </div>
            ) : (
              chatBubbles.map((m) => (
                <div key={m.id} className={`sched-msg-wrap ${m.role === 'user' ? 'user' : 'bot'}`}>
                  {(m.content || '').trim().length > 0 && (
                    <div
                      className={`sched-msg ${m.role === 'user' ? 'user' : 'bot'}`}
                      dangerouslySetInnerHTML={{ __html: sanitizeHTML(m.content) }}
                    />
                  )}
                  {/* conversational-scheduling affordances, same as today */}
                  {m.metadata?.schedulingSlots?.length > 0 && (
                    <SchedulingSlots slots={m.metadata.schedulingSlots} schedulingContext={m.metadata.schedulingContext} />
                  )}
                  {m.metadata?.schedulingConfirm?.slot && <SchedulingConfirmCard confirm={m.metadata.schedulingConfirm} />}
                  {m.metadata?.schedulingNotice && <SchedulingNotice notice={m.metadata.schedulingNotice} />}
                </div>
              ))
            )}
          </div>
          <form className="sched-cfoot" onSubmit={chatSend}>
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask a question…"
              disabled={isTyping}
              aria-label="Ask a question"
            />
            <button type="submit" disabled={isTyping || !chatInput.trim()} aria-label="Send">➤</button>
          </form>
        </section>
      </main>
    </div>
  );
}
