import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { resolveWidgetBehavior, setHostViewportWidth } from '../resolveWidgetBehavior';

describe('resolveWidgetBehavior', () => {
  beforeEach(() => {
    // Reset host viewport width before each test
    setHostViewportWidth(null);
  });

  describe('with host viewport width (embedded mode)', () => {
    it('returns global settings on desktop host viewport', () => {
      setHostViewportWidth(1280);
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

    it('merges mobile overrides when host viewport is below 768px', () => {
      setHostViewportWidth(375);
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

    it('returns global settings at exactly 768px host viewport', () => {
      setHostViewportWidth(768);
      const config = {
        widget_behavior: {
          start_open: true,
          mobile: { start_open: false },
        },
      };
      const result = resolveWidgetBehavior(config);
      expect(result.start_open).toBe(true);
    });

    it('applies mobile overrides at 767px host viewport', () => {
      setHostViewportWidth(767);
      const config = {
        widget_behavior: {
          start_open: true,
          mobile: { start_open: false },
        },
      };
      const result = resolveWidgetBehavior(config);
      expect(result.start_open).toBe(false);
    });

    it('inherits global fields not specified in mobile overrides', () => {
      setHostViewportWidth(375);
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
  });

  describe('without host viewport (fallback to window.innerWidth)', () => {
    let originalInnerWidth;

    beforeEach(() => {
      originalInnerWidth = window.innerWidth;
      setHostViewportWidth(null);
    });

    afterEach(() => {
      Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, writable: true, configurable: true });
    });

    it('uses window.innerWidth when no host viewport set', () => {
      Object.defineProperty(window, 'innerWidth', { value: 375, writable: true, configurable: true });
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

  describe('edge cases', () => {
    it('returns global settings when no mobile block is present', () => {
      setHostViewportWidth(375);
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

    it('handles empty mobile override object', () => {
      setHostViewportWidth(375);
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
  });
});
