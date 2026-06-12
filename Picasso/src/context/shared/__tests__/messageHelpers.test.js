import { describe, it, expect } from '@jest/globals';
import { trimHistoryForSend, mergeSchedulingSlots } from '../messageHelpers';

const u = (content) => ({ role: 'user', content });
const a = (content) => ({ role: 'assistant', content });

describe('trimHistoryForSend', () => {
  it('returns the input unchanged for empty / non-array values', () => {
    expect(trimHistoryForSend([])).toEqual([]);
    expect(trimHistoryForSend(null)).toEqual([]);
    expect(trimHistoryForSend(undefined)).toEqual([]);
  });

  it('keeps ALL user messages but only the last 2 assistant responses', () => {
    const msgs = [
      u('my name is Chris'), a('Hi Chris'),
      u('I have two foster kids'), a('Thanks for sharing'),
      u('tell me about parental support'), a('We offer respite...'),
      u('yes'), a('Here are the details...'),
    ];
    const out = trimHistoryForSend(msgs);
    // all 4 user messages survive (factual recall)
    expect(out.filter((m) => m.role === 'user')).toHaveLength(4);
    // only the last 2 assistant responses survive
    const assistants = out.filter((m) => m.role === 'assistant').map((m) => m.content);
    expect(assistants).toEqual(['We offer respite...', 'Here are the details...']);
  });

  it('preserves chronological order', () => {
    const msgs = [u('a'), a('1'), u('b'), a('2'), u('c'), a('3')];
    const out = trimHistoryForSend(msgs, { maxAssistant: 2 });
    expect(out.map((m) => m.content)).toEqual(['a', 'b', '2', 'c', '3']);
  });

  it('preserves an early user fact (memory) AND the last assistant question (continuation)', () => {
    const msgs = [
      u('my name is Chris'),
      a('Hello!'),
      ...Array.from({ length: 6 }, (_, i) => a(`filler answer ${i}`)),
      a('Would you like to learn about parental support?'),
    ];
    const out = trimHistoryForSend(msgs);
    expect(out.some((m) => m.role === 'user' && m.content === 'my name is Chris')).toBe(true);
    expect(out[out.length - 1].content).toBe('Would you like to learn about parental support?');
  });

  it('caps user turns to maxUserTurns (keeps the most recent)', () => {
    const msgs = Array.from({ length: 25 }, (_, i) => u(`q${i}`));
    const out = trimHistoryForSend(msgs, { maxUserTurns: 20 });
    expect(out).toHaveLength(20);
    expect(out[0].content).toBe('q5'); // oldest 5 dropped
    expect(out[out.length - 1].content).toBe('q24');
  });

  it('drops entries that are neither user nor assistant', () => {
    const msgs = [u('hi'), { role: 'system', content: 'x' }, a('there')];
    const out = trimHistoryForSend(msgs);
    expect(out.every((m) => m.role === 'user' || m.role === 'assistant')).toBe(true);
  });
});

// Multi-day slots fix (companion to lambda fix/agent-multiday-slots): an agent
// turn emits one scheduling_slots SSE PER dated lookup; replacing
// metadata.schedulingSlots left only the LAST event's chips rendered.
describe('mergeSchedulingSlots', () => {
  const slot = (id, label = `slot ${id}`) => ({
    slotId: id,
    start: '2026-06-15T14:00:00Z',
    end: '2026-06-15T14:30:00Z',
    label,
  });

  it('first event on a message (no existing slots) → incoming slots as-is', () => {
    const incoming = [slot('s1'), slot('s2')];
    expect(mergeSchedulingSlots(undefined, incoming)).toEqual(incoming);
    expect(mergeSchedulingSlots(null, incoming)).toEqual(incoming);
    expect(mergeSchedulingSlots([], incoming)).toEqual(incoming);
  });

  it('second event APPENDS after the existing slots (order preserved — both days render)', () => {
    const monday = [slot('s1', 'Mon · 9:00 AM'), slot('s2', 'Mon · 2:30 PM')];
    const tuesday = [slot('s3', 'Tue · 3:00 PM')];
    expect(mergeSchedulingSlots(monday, tuesday)).toEqual([...monday, ...tuesday]);
  });

  it('dedupes by slotId — first occurrence wins, including dupes within the incoming batch', () => {
    const existing = [slot('s1', 'kept label')];
    const incoming = [slot('s1', 'replaced label — must not win'), slot('s2'), slot('s2')];
    const out = mergeSchedulingSlots(existing, incoming);
    expect(out.map((s) => s.slotId)).toEqual(['s1', 's2']);
    expect(out[0].label).toBe('kept label');
  });

  it('caps the merged list at 10 (existing slots win the cap — matches the backend union cap)', () => {
    const existing = Array.from({ length: 9 }, (_, i) => slot(`e${i}`));
    const incoming = [slot('n1'), slot('n2'), slot('n3')];
    const out = mergeSchedulingSlots(existing, incoming);
    expect(out).toHaveLength(10);
    expect(out.slice(0, 9)).toEqual(existing);
    expect(out[9].slotId).toBe('n1');
  });

  it('skips malformed entries (no slotId / null) and tolerates a non-array incoming value', () => {
    const existing = [slot('s1')];
    expect(mergeSchedulingSlots(existing, [null, { label: 'orphan' }, slot('s2')]))
      .toEqual([slot('s1'), slot('s2')]);
    expect(mergeSchedulingSlots(existing, undefined)).toEqual(existing);
  });
});
