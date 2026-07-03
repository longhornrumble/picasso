/**
 * W3.1 — welcome-seeding hoist drift guard (pipeline-audit watch item).
 *
 * HAIRLINE_REDESIGN_MAPPING.md §9 flagged that the welcome-message/chips
 * seeding was duplicated inline across THREE providers
 * (StreamingChatProvider, HTTPChatProvider, ChatProvider) and asked that any
 * touching item "hoist the seeding once" rather than adjusting three
 * separately-drifting copies. W3.1 hoisted the action-chip gate+slice logic
 * into `computeWelcomeActions()` (src/context/shared/messageHelpers.js,
 * itself unit-tested in messageHelpers.test.js) and pointed all three
 * providers at it.
 *
 * Source-scan on purpose (same rationale as ctaActionContract.test.jsx):
 * a render-and-click matrix over three context-heavy, async, fetch/
 * sessionStorage-dependent providers would be brittle and slow relative to
 * what this guard needs to prove — that nobody re-inlines the duplicated
 * gate/slice logic in a future edit. Rendering behavior itself is covered
 * by messageHelpers.test.js (the pure function) and
 * ChatWidget.test.jsx / WelcomeView.test.jsx (the view-state + rendering
 * that consumes it).
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const PROVIDER_FILES = [
  'StreamingChatProvider.jsx',
  'HTTPChatProvider.jsx',
  'ChatProvider.jsx',
];

function readProvider(filename) {
  return readFileSync(join(__dirname, '..', filename), 'utf8');
}

describe('W3.1: welcome-action-chip seeding is hoisted, not re-duplicated', () => {
  it.each(PROVIDER_FILES)('%s imports computeWelcomeActions from the shared module', (filename) => {
    const src = readProvider(filename);
    expect(src).toMatch(/computeWelcomeActions/);
    expect(src).toMatch(/from ['"]\.\/shared\/messageHelpers['"]/);
  });

  it.each(PROVIDER_FILES)('%s calls computeWelcomeActions(tenantConfig) at least once', (filename) => {
    const src = readProvider(filename);
    expect(src).toMatch(/computeWelcomeActions\(tenantConfig\)/);
  });

  it.each(PROVIDER_FILES)(
    '%s does not re-inline the duplicated action_chips gate/slice logic',
    (filename) => {
      const src = readProvider(filename);
      // The pre-hoist duplicated snippet always referenced these three
      // config fields together in the same welcome-seeding block. Only the
      // shared helper (messageHelpers.js, not scanned here) should do this now.
      expect(src).not.toMatch(/show_on_welcome/);
      expect(src).not.toMatch(/\.default_chips/);
      expect(src).not.toMatch(/max_display/);
    }
  );

  it('the shared helper itself still contains the gate/slice logic (sanity check on the scan)', () => {
    const src = readFileSync(
      join(__dirname, '..', 'shared', 'messageHelpers.js'),
      'utf8'
    );
    expect(src).toMatch(/export const computeWelcomeActions/);
    expect(src).toMatch(/show_on_welcome/);
    expect(src).toMatch(/max_display/);
  });
});
