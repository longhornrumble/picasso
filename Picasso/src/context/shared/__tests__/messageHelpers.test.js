import { describe, it, expect } from '@jest/globals';
import { trimHistoryForSend } from '../messageHelpers';

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
