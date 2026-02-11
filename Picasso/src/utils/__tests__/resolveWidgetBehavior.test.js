import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { resolveWidgetBehavior } from '../resolveWidgetBehavior';

describe('resolveWidgetBehavior', () => {
  let originalInnerWidth;

  beforeEach(() => {
    originalInnerWidth = window.innerWidth;
    // Default to desktop
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, writable: true, configurable: true });
  });

  it('returns global settings when no mobile block is present', () => {
    const config = {
      widget_behavior: {
        start_open: true,
        auto_open_delay: 3,
        remember_state: true,
      },
    };
    const result = resolveWidgetBehavior(config);
    expect(result).toEqual(config.widget_behavior);
  });

  it('returns global settings on desktop even when mobile block exists', () => {
    window.innerWidth = 1024;
    const config = {
      widget_behavior: {
        start_open: true,
        auto_open_delay: 3,
        remember_state: true,
        mobile: { start_open: false, auto_open_delay: 0 },
      },
    };
    const result = resolveWidgetBehavior(config);
    expect(result).toEqual(config.widget_behavior);
  });

  it('returns global settings at exactly 768px (breakpoint boundary)', () => {
    window.innerWidth = 768;
    const config = {
      widget_behavior: {
        start_open: true,
        mobile: { start_open: false },
      },
    };
    const result = resolveWidgetBehavior(config);
    expect(result.start_open).toBe(true);
  });

  it('merges mobile overrides below 768px', () => {
    window.innerWidth = 375;
    const config = {
      widget_behavior: {
        start_open: true,
        auto_open_delay: 3,
        remember_state: true,
        mobile: { start_open: false, auto_open_delay: 0 },
      },
    };
    const result = resolveWidgetBehavior(config);
    expect(result.start_open).toBe(false);
    expect(result.auto_open_delay).toBe(0);
    expect(result.remember_state).toBe(true);
    expect(result.mobile).toBeUndefined();
  });

  it('inherits global fields not specified in mobile overrides', () => {
    window.innerWidth = 375;
    const config = {
      widget_behavior: {
        start_open: true,
        auto_open_delay: 5,
        remember_state: true,
        mobile: { start_open: false },
      },
    };
    const result = resolveWidgetBehavior(config);
    expect(result.start_open).toBe(false);
    expect(result.auto_open_delay).toBe(5);
    expect(result.remember_state).toBe(true);
  });

  it('handles undefined config gracefully', () => {
    const result = resolveWidgetBehavior(undefined);
    expect(result).toEqual({});
  });

  it('handles null config gracefully', () => {
    const result = resolveWidgetBehavior(null);
    expect(result).toEqual({});
  });

  it('handles config with no widget_behavior key', () => {
    const result = resolveWidgetBehavior({ some_other_key: true });
    expect(result).toEqual({});
  });

  it('handles empty mobile override object below breakpoint', () => {
    window.innerWidth = 375;
    const config = {
      widget_behavior: {
        start_open: true,
        mobile: {},
      },
    };
    const result = resolveWidgetBehavior(config);
    expect(result.start_open).toBe(true);
    expect(result.mobile).toBeUndefined();
  });

  it('applies mobile overrides at 767px (just below breakpoint)', () => {
    window.innerWidth = 767;
    const config = {
      widget_behavior: {
        start_open: true,
        mobile: { start_open: false },
      },
    };
    const result = resolveWidgetBehavior(config);
    expect(result.start_open).toBe(false);
  });
});
