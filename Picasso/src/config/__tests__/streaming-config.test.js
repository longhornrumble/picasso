/**
 * Transport selection contract (operator ruling 2026-07-10):
 * streaming is the product, HTTP is the fallback. Only runtime levers select
 * the transport — the emergency kill switch and the ?streaming= URL override —
 * so each mode can be tested independently. Tenant config does NOT select.
 */

import { isStreamingEnabled } from '../streaming-config';

const resetLevers = () => {
  delete window.PICASSO_DISABLE_STREAMING;
  delete window.PICASSO_FORCE_STREAMING;
  window.history.pushState({}, '', '/');
};

describe('isStreamingEnabled — transport selection', () => {
  beforeEach(resetLevers);
  afterAll(resetLevers);

  it('defaults to streaming (streaming is the product)', () => {
    expect(isStreamingEnabled()).toBe(true);
  });

  it('ignores tenant config — features.streaming_enabled does not select the transport', () => {
    expect(isStreamingEnabled({ features: { streaming_enabled: false } })).toBe(true);
    expect(isStreamingEnabled({ features: { streaming: false } })).toBe(true);
  });

  it('emergency kill switch selects HTTP', () => {
    window.PICASSO_DISABLE_STREAMING = true;
    expect(isStreamingEnabled()).toBe(false);
  });

  it('?streaming=false selects HTTP (independent test lever)', () => {
    window.history.pushState({}, '', '/?streaming=false');
    expect(isStreamingEnabled()).toBe(false);
  });

  it('?streaming=true selects streaming explicitly', () => {
    window.history.pushState({}, '', '/?streaming=true');
    expect(isStreamingEnabled()).toBe(true);
  });

  it('kill switch wins over ?streaming=true', () => {
    window.history.pushState({}, '', '/?streaming=true');
    window.PICASSO_DISABLE_STREAMING = true;
    expect(isStreamingEnabled()).toBe(false);
  });

  it('unrecognized ?streaming values fall through to the default', () => {
    window.history.pushState({}, '', '/?streaming=maybe');
    expect(isStreamingEnabled()).toBe(true);
  });
});
