/**
 * SchedulingMonthCalendar — the "Pick a specific date" affordance for the branded
 * full-page scheduling surface (M1a). Renders a month grid; selecting a day emits the
 * SAME deterministic signal the in-chat §B18 SchedulingDayPicker uses
 * (`{ scheduling_day_selected: 'YYYY-MM-DD' }`), so the backend agent proposes that
 * day's times lazily — no new "month availability" endpoint is required.
 *
 * Selectable window: tomorrow .. today + maxAdvanceDays (config-driven, default 60).
 * Days outside the window are disabled; the backend still arbitrates real availability
 * (a selected open day with no free slots returns the normal "no times" notice).
 *
 * Runs in the browser (real Date is available here — unlike workflow scripts).
 */

import React, { useMemo, useState } from 'react';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function isoDate(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
function dayLabel(d) {
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * @param {object}   props
 * @param {(date:string,label:string)=>void} props.onSelectDay
 * @param {object}   [props.config]   - tenant config (for max-advance window, optional)
 * @param {boolean}  [props.disabled] - true while a turn is in flight
 */
export default function SchedulingMonthCalendar({ onSelectDay, config, disabled = false }) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const maxAdvanceDays = Number(config?.scheduling?.max_advance_days) || 60;
  const windowEnd = useMemo(() => addDays(today, maxAdvanceDays), [today, maxAdvanceDays]);

  // monthOffset: 0 = current month, 1 = next, ... (no past months)
  const [monthOffset, setMonthOffset] = useState(0);
  const [selected, setSelected] = useState(null);

  const view = useMemo(() => {
    const base = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    return { year: base.getFullYear(), month: base.getMonth() };
  }, [today, monthOffset]);

  const firstDow = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(view.year, view.month, d));

  const canPrev = monthOffset > 0;
  // allow paging forward only while the window still has selectable days
  const lastVisible = new Date(view.year, view.month, daysInMonth);
  const canNext = lastVisible < windowEnd;

  const selectableDay = (d) => d > today && d <= windowEnd; // strictly after today, within window

  const handlePick = (d) => {
    if (disabled || !selectableDay(d)) return;
    const iso = isoDate(d);
    setSelected(iso);
    onSelectDay?.(iso, dayLabel(d));
  };

  return (
    <div className="sched-cal" data-testid="sched-calendar">
      <div className="sched-cal-top">
        <div className="sched-cal-month">{MONTHS[view.month]} {view.year}</div>
        <div className="sched-cal-nav">
          <button
            type="button"
            aria-label="Previous month"
            disabled={!canPrev}
            onClick={() => canPrev && setMonthOffset((m) => m - 1)}
          >‹</button>
          <button
            type="button"
            aria-label="Next month"
            disabled={!canNext}
            onClick={() => canNext && setMonthOffset((m) => m + 1)}
          >›</button>
        </div>
      </div>
      <div className="sched-cal-dows">
        {DOW.map((x, i) => <div key={i}>{x}</div>)}
      </div>
      <div className="sched-cal-days">
        {cells.map((d, i) => {
          if (!d) return <span key={`e${i}`} className="sched-cal-empty" />;
          const ok = selectableDay(d);
          const iso = isoDate(d);
          return (
            <button
              key={iso}
              type="button"
              className={`sched-cal-day${selected === iso ? ' sel' : ''}`}
              disabled={!ok || disabled}
              aria-label={dayLabel(d)}
              onClick={() => handlePick(d)}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
