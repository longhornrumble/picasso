/**
 * strings.js contract test (W0.3 — centralized chrome strings)
 *
 * This module has no consumers yet, so the only thing worth asserting is
 * its own shape: every leaf value in the exported tree is a non-empty
 * string. That's enough to catch the two failure modes that matter here —
 * an accidentally-empty string, and a leaf that isn't a string at all
 * (e.g. someone starts building out a template/function before this
 * module is ready for that).
 */

import { strings } from '../strings.js';

/** Recursively walk a plain-object tree, yielding [dotted.path, value] for every leaf. */
function collectLeaves(node, path = []) {
  const leaves = [];
  for (const [key, value] of Object.entries(node)) {
    const nextPath = [...path, key];
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      leaves.push(...collectLeaves(value, nextPath));
    } else {
      leaves.push([nextPath.join('.'), value]);
    }
  }
  return leaves;
}

describe('src/i18n/strings.js', () => {
  test('exports a plain object (no framework, no functions)', () => {
    expect(typeof strings).toBe('object');
    expect(strings).not.toBeNull();
  });

  const leaves = collectLeaves(strings);

  test('has at least one string extracted from the design spec', () => {
    expect(leaves.length).toBeGreaterThan(0);
  });

  test.each(leaves)('%s is a non-empty string', (_path, value) => {
    expect(typeof value).toBe('string');
    expect(value.length).toBeGreaterThan(0);
  });

  test.each(leaves)('%s has no leading/trailing whitespace', (_path, value) => {
    expect(value).toBe(value.trim());
  });

  // Spot-checks against DESIGN_SPEC.md (guards against copy drift on future edits).
  test('composer placeholder matches spec verbatim', () => {
    expect(strings.composer.placeholder).toBe('Ask a question…');
  });

  test('"Common questions" is identical between the welcome row and overlay title', () => {
    expect(strings.welcome.commonQuestionsRow).toBe(strings.questionsOverlay.title);
  });

  test('footer copy matches spec ("Powered by" + "MyRecruiter")', () => {
    expect(strings.footer.poweredByPrefix).toBe('Powered by');
    expect(strings.footer.brandName).toBe('MyRecruiter');
  });

  test('privacy checklist has exactly the 3 spec rows', () => {
    expect(Object.keys(strings.privacy.checklist).sort()).toEqual(
      ['auditLogging', 'encryptedInTransit', 'retentionVaries'].sort()
    );
  });
});
