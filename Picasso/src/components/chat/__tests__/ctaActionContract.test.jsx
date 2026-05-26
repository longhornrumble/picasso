/**
 * CI-3a — Frontend CTA-action dispatch contract (scheduling v1 sub-phase A).
 *
 * Intent (impl plan §3): "Adding any new CTA action without updating the
 * MessageBubble dispatcher → red CI."
 *
 * Design note — deviation from the literal spec, resolved with the user:
 * the plan said "Picasso imports `cta.schema.ts` action enum". That enum
 * lives in the SEPARATE picasso-config-builder repo; there is no shared
 * module, and duplicating it here would re-create the silent-drift hazard
 * this guard exists to prevent. So CI-3a is a Picasso-OWNED contract: the
 * declared HANDLED_CTA_ACTIONS list below is the single source of truth for
 * the CTA actions the widget dispatches, and this test asserts it stays
 * exactly equal to the `cta.action === '...'` literals in
 * MessageBubble.handleActionClick. Add a dispatch branch without declaring
 * it (or remove one) → red. Keeping this aligned with config-builder's
 * cta.schema.ts action enum is a documented manual concern (a future
 * shared-types mechanism / CI-3b could automate the cross-repo half).
 *
 * Rendering-independent on purpose: a source-scan is robust where a
 * render-and-click matrix over a Radix/context-heavy component is brittle.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// The contract: every CTA-or-chip action MessageBubble dispatches across
// BOTH handleCtaClick (local var `cta`) and handleActionClick (local var
// `action`). `form_trigger` is the type-alias handled inside the start_form
// branch; `show_showcase` is dispatched from handleActionClick (chip).
const HANDLED_CTA_ACTIONS = [
  'cancel_form',
  'external_link',
  'form_trigger',
  'resume_form',
  'resume_scheduling',
  'send_query',
  'show_info',
  'show_showcase',
  'start_form',
  'start_scheduling',
  'switch_form',
].sort();

const MESSAGE_BUBBLE_SRC = readFileSync(
  join(__dirname, '..', 'MessageBubble.jsx'),
  'utf8'
);

function scannedDispatchActions(src) {
  const set = new Set();
  // Match both handler locals: `cta.action === '…'` (handleCtaClick) and
  // `action.action === '…'` (handleActionClick). Without both, the contract
  // is blind to new dispatch branches added in handleActionClick — that was
  // the gap that hid `show_showcase` from this guard pre-2026-05-24 audit.
  const re = /(?:cta|action)\.action === '([a-z_]+)'/g;
  let m;
  while ((m = re.exec(src)) !== null) set.add(m[1]);
  return [...set].sort();
}

describe('CI-3a: CTA-action dispatch contract', () => {
  it('declared contract exactly equals MessageBubble dispatched actions (drift guard)', () => {
    // Fails red if a `cta.action === 'x'` branch is added/removed without
    // updating HANDLED_CTA_ACTIONS — the core CI-3a protection.
    expect(scannedDispatchActions(MESSAGE_BUBBLE_SRC)).toEqual(
      HANDLED_CTA_ACTIONS
    );
  });

  it.each(['start_scheduling', 'resume_scheduling'])(
    'scheduling action %s remains wired in the dispatcher (sub-phase A A2)',
    (action) => {
      // Guards the A2 placeholder branches against accidental removal.
      expect(HANDLED_CTA_ACTIONS).toContain(action);
      expect(MESSAGE_BUBBLE_SRC).toContain(`cta.action === '${action}'`);
    }
  );

  it('contract is non-empty and unique (guards a broken scan/regex)', () => {
    expect(HANDLED_CTA_ACTIONS.length).toBeGreaterThan(0);
    expect(new Set(HANDLED_CTA_ACTIONS).size).toBe(HANDLED_CTA_ACTIONS.length);
  });
});
