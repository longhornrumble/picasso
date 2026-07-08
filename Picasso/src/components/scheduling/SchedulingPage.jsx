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

import React, { useEffect, useMemo, useState } from 'react';
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
// Footer timezone note ("Times shown in Central Time (CDT)"). Long + short names
// derived from the booking's timezone; returns null when unavailable so the
// powered-by line degrades to "Powered by MyRecruiter" alone.
function tzNote(tz, ref) {
  if (!tz) return null;
  try {
    const d = ref ? new Date(ref) : new Date();
    const at = isNaN(d.getTime()) ? new Date() : d;
    const nameOf = (style) => {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: style }).formatToParts(at);
      const p = parts.find((x) => x.type === 'timeZoneName');
      return p ? p.value : null;
    };
    const long = nameOf('long');
    const short = nameOf('short');
    if (long && short && long !== short) return `Times shown in ${long} (${short})`;
    if (short) return `Times shown in ${short}`;
    return null;
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
  const [done, setDone] = useState(null);
  const [chatInput, setChatInput] = useState('');

  const apptLabel = summary && summary.appointment_label;
  const heroTitle = apptLabel ? `${copy.verb} your ${apptLabel}` : `${copy.verb} your appointment`;
  const currentLine = summary && formatCurrent(summary.current_start_at, summary.timezone);
  const tzLine = summary && tzNote(summary.timezone, summary.current_start_at);

  async function loadDay(dateIso) {
    if (!tenantHash || !session) {
      setError('missing_link');
      return;
    }
    setLoading(true);
    setError(null);
    setSelectedSlot(null);
    setDone(null); // changing the day clears any confirmation banner
    try {
      const r = await proposeTimes({ tenantHash, session, date: isCancel ? undefined : dateIso });
      setSummary({
        appointment_label: r.appointment_label,
        current_start_at: r.current_start_at,
        timezone: r.timezone,
      });
      setTimes(Array.isArray(r.slots) ? r.slots : []);
    } catch (e) {
      setError((e && (e.code || e.message)) || 'load_failed');
      setTimes([]);
    } finally {
      setLoading(false);
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
    loadDay(iso);
  };

  const confirmReschedule = async () => {
    if (!selectedSlot) return;
    setLoading(true);
    setError(null);
    try {
      const r = await mutateBooking({
        tenantHash, session, mutation: 'reschedule',
        newSlot: { start: selectedSlot.start, end: selectedSlot.end },
      });
      if (r.outcome === 'success' || r.outcome === 'pending_calendar_sync') setDone('rescheduled');
      else setError('reschedule_failed');
    } catch (e) {
      setError((e && e.code) || 'reschedule_failed');
    } finally {
      setLoading(false);
    }
  };
  const confirmCancel = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await mutateBooking({ tenantHash, session, mutation: 'cancel' });
      if (r.outcome === 'deleted' || r.outcome === 'pending_calendar_sync') setDone('canceled');
      else setError('cancel_failed');
    } catch (e) {
      setError((e && e.code) || 'cancel_failed');
    } finally {
      setLoading(false);
    }
  };

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
      {/* Org header — wordmark-as-logo (no logo image), "Scheduling" past a hairline. */}
      <header className="sched-brand">
        <div className="sched-org">{orgName}</div>
        <div className="sched-tag">Scheduling</div>
      </header>

      <main className="sched-wrap">
        <section className="sched-panel sched-picker">
          <span className="sched-pill">{copy.pill}</span>
          <h1 className="sched-title">{heroTitle}</h1>
          {currentLine && (
            <p className="sched-current">Currently booked for <b>{currentLine}</b></p>
          )}

          {isCancel ? (
            done === 'canceled' ? (
              <div className="sched-banner">
                <span className="sched-banner-check" aria-hidden="true">✓</span>
                <span>Your appointment has been canceled. The team has been notified.</span>
              </div>
            ) : (
              <div className="sched-cancel">
                <button type="button" className="sched-cta sched-cta-danger" disabled={loading} onClick={confirmCancel}>
                  {loading ? 'Canceling…' : 'Cancel appointment'}
                </button>
                <span className="sched-hint">Changed your mind? Just close this page — nothing happens until you confirm.</span>
                {error && <p className="sched-empty">Something went wrong — please try again.</p>}
              </div>
            )
          ) : (
            <>
              <div className="sched-section-label">Choose a day</div>
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

              <div className="sched-section-label">
                Available times{selectedDayLabel ? ` · ${selectedDayLabel}` : ''}
              </div>
              {loading ? (
                <p className="sched-typing">Finding times…</p>
              ) : times.length > 0 ? (
                <div className="sched-timelist">
                  {times.map((s) => {
                    const sel = selectedSlot && (selectedSlot.slotId || selectedSlot.start) === (s.slotId || s.start);
                    return (
                      <button
                        key={s.slotId || s.start}
                        type="button"
                        className={`sched-time${sel ? ' sel' : ''}`}
                        onClick={() => { setSelectedSlot(s); setDone(null); }}
                      >
                        <span>{s.label}</span>
                        {sel && <span className="sched-time-check" aria-hidden="true">✓</span>}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="sched-empty">
                  {error ? 'We couldn’t load times — try another date, or ask below.' : 'No times available that day — try another date.'}
                </p>
              )}

              <div className="sched-confirmbar">
                <button type="button" className="sched-cta" disabled={!selectedSlot || loading} onClick={confirmReschedule}>
                  Confirm new time
                </button>
              </div>
              {done === 'rescheduled' && selectedSlot && (
                <div className="sched-banner">
                  <span className="sched-banner-check" aria-hidden="true">✓</span>
                  <span>You&rsquo;re rebooked for {selectedSlot.label}. A calendar update is on its way.</span>
                </div>
              )}
            </>
          )}
        </section>

        {/* COMPANION CHAT — full agent chat (questions + conversational scheduling). */}
        <section className="sched-panel sched-companion">
          <div className="sched-chead">
            <div className="sched-ct">Have a question?</div>
            <div className="sched-cs">Ask the {orgName} team anything about your appointment.</div>
          </div>
          <div className="sched-cbody">
            {chatBubbles.length === 0 ? (
              <div className="sched-msg-wrap bot">
                <div className="sched-sender">{orgName}</div>
                <div className="sched-msg bot">
                  Ask anything about your appointment — what to expect, the location, or who you&rsquo;ll meet.
                </div>
              </div>
            ) : (
              chatBubbles.map((m) => {
                const isUser = m.role === 'user';
                return (
                  <div key={m.id} className={`sched-msg-wrap ${isUser ? 'user' : 'bot'}`}>
                    {!isUser && <div className="sched-sender">{orgName}</div>}
                    {(m.content || '').trim().length > 0 && (
                      <div
                        className={`sched-msg ${isUser ? 'user' : 'bot'}`}
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
                );
              })
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
            <button className="sched-send" type="submit" disabled={isTyping || !chatInput.trim()} aria-label="Send">↑</button>
          </form>
        </section>

        {/* Powered-by line — bundled mark, fixed platform attribution + timezone note. */}
        <div className="sched-poweredby">
          <span>Powered by</span>
          <img className="sched-poweredby-mark" src="/myrecruiter-mark.png" alt="" aria-hidden="true" />
          <span className="sched-poweredby-brand">MyRecruiter</span>
          {tzLine && <span>· {tzLine}</span>}
        </div>
      </main>
    </div>
  );
}
