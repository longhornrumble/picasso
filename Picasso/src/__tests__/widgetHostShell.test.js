/**
 * Widget host shell dims + breakpoint — HAIRLINE_WORKPLAN.md W6.1 contract tests.
 *
 * widget-host.js is a non-exporting IIFE (attaches to window.PicassoWidget on
 * script load; auto-init depends on a <script data-tenant> tag), so per this
 * repo's existing convention for that file (see
 * src/analytics/__tests__/reachPing.test.js) these tests replicate the
 * relevant methods in a harness and exercise the harness directly.
 * If widget-host.js's expand()/setupResizeObserver()/handlePicassoEvent()
 * change, update this harness to match.
 *
 * Covers:
 *  - desktop (>480px): 380 x min(640px, calc(100vh - 48px)) panel, iframe
 *    borderRadius 12px
 *  - mobile (<=480px): full-screen sheet (0 offsets, 100vw/100vh), iframe
 *    borderRadius 0 — D6 default (retires the old 768/1024 mobile/tablet tiers)
 *  - D1 default: edge/adaptive-height mode fully retired — SET_EDGE_MODE is
 *    never sent, and MESSAGE_SENT/SESSION_CLEARED no longer resize the shell
 *  - a static-source guard that fails if SET_EDGE_MODE/isActive/
 *    activateSession/deactivateSession are ever reintroduced into
 *    widget-host.js
 */

const fs = require('fs');
const path = require('path');

function makeWidget() {
  const sentCommands = [];

  return {
    isOpen: false,
    container: { style: {} },
    iframe: { style: {} },
    config: {
      expandedWidth: '380px',
      expandedHeight: 'min(640px, calc(100vh - 48px))',
      zIndex: 10000
    },
    _sentCommands: sentCommands,

    sendCommand(action, payload = {}) {
      sentCommands.push({ action, payload });
    },

    // Mirrors widget-host.js expand()
    expand() {
      if (this.isOpen) return;
      this.isOpen = true;

      const isMobile = window.innerWidth <= 480;

      if (isMobile) {
        Object.assign(this.container.style, {
          position: 'fixed',
          top: '0',
          left: '0',
          bottom: '0',
          right: '0',
          width: '100vw',
          height: '100vh',
          zIndex: this.config.zIndex + 1000
        });
      } else {
        Object.assign(this.container.style, {
          width: this.config.expandedWidth,
          height: this.config.expandedHeight,
          top: 'auto',
          bottom: '20px',
          right: '20px',
          left: 'auto'
        });
      }

      this.iframe.style.borderRadius = isMobile ? '0' : '12px';
    },

    // Mirrors widget-host.js minimize()
    minimize() {
      if (!this.isOpen) return;
      this.isOpen = false;
      Object.assign(this.container.style, {
        position: 'fixed',
        width: '56px',
        height: '56px',
        bottom: '20px',
        right: '20px',
        top: 'auto',
        left: 'auto'
      });
      this.iframe.style.borderRadius = '50%';
    },

    // Mirrors widget-host.js setupResizeObserver()'s ResizeObserver callback body
    handleWindowResize() {
      if (!this.isOpen) return;

      const isMobile = window.innerWidth <= 480;
      if (isMobile) {
        Object.assign(this.container.style, {
          top: '0',
          left: '0',
          bottom: '0',
          right: '0',
          width: '100vw',
          height: '100vh'
        });
      } else {
        Object.assign(this.container.style, {
          width: this.config.expandedWidth,
          height: this.config.expandedHeight,
          bottom: '20px',
          right: '20px',
          top: 'auto',
          left: 'auto'
        });
      }
      this.iframe.style.borderRadius = isMobile ? '0' : '12px';
    },

    // Mirrors widget-host.js handlePicassoEvent()'s MESSAGE_SENT/SESSION_CLEARED
    // cases (D1 default: both are no-ops now — edge mode is retired)
    handlePicassoEvent(data) {
      switch (data.event) {
        case 'MESSAGE_SENT':
        case 'SESSION_CLEARED':
          break;
        default:
          break;
      }
    }
  };
}

function setInnerWidth(width) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width
  });
}

describe('widget-host shell dims + breakpoint (W6.1)', () => {
  const originalInnerWidth = window.innerWidth;

  afterEach(() => {
    setInnerWidth(originalInnerWidth);
  });

  test('desktop (>480px): expands to 380 x min(640px, calc(100vh - 48px)) with 12px radius', () => {
    setInnerWidth(1024);
    const w = makeWidget();
    w.expand();

    expect(w.container.style.width).toBe('380px');
    expect(w.container.style.height).toBe('min(640px, calc(100vh - 48px))');
    expect(w.iframe.style.borderRadius).toBe('12px');
  });

  test('breakpoint boundary: 481px viewport is desktop, not mobile', () => {
    setInnerWidth(481);
    const w = makeWidget();
    w.expand();

    expect(w.container.style.width).toBe('380px');
    expect(w.iframe.style.borderRadius).toBe('12px');
  });

  test('mobile (<=480px): full-screen sheet with 0 radius, no margins', () => {
    setInnerWidth(480);
    const w = makeWidget();
    w.expand();

    expect(w.container.style.width).toBe('100vw');
    expect(w.container.style.height).toBe('100vh');
    expect(w.container.style.top).toBe('0');
    expect(w.container.style.left).toBe('0');
    expect(w.container.style.right).toBe('0');
    expect(w.container.style.bottom).toBe('0');
    expect(w.iframe.style.borderRadius).toBe('0');
  });

  test('small phone viewport (320px) is also a full-screen sheet', () => {
    setInnerWidth(320);
    const w = makeWidget();
    w.expand();

    expect(w.container.style.width).toBe('100vw');
    expect(w.iframe.style.borderRadius).toBe('0');
  });

  test('old 768/1024 tablet tier no longer produces distinct dims (collapses into desktop)', () => {
    setInnerWidth(800); // used to be the 768-1024 "tablet" tier with a 480px-wide panel
    const w = makeWidget();
    w.expand();

    expect(w.container.style.width).toBe('380px');
    expect(w.container.style.width).not.toBe('480px');
  });

  test('resizing across the breakpoint while open re-applies the correct tier', () => {
    setInnerWidth(1024);
    const w = makeWidget();
    w.expand();
    expect(w.iframe.style.borderRadius).toBe('12px');

    setInnerWidth(400);
    w.handleWindowResize();
    expect(w.container.style.width).toBe('100vw');
    expect(w.iframe.style.borderRadius).toBe('0');

    setInnerWidth(1024);
    w.handleWindowResize();
    expect(w.container.style.width).toBe('380px');
    expect(w.iframe.style.borderRadius).toBe('12px');
  });

  test('resize-observer callback no-ops while the widget is closed', () => {
    setInnerWidth(1024);
    const w = makeWidget();
    w.handleWindowResize();

    expect(w.container.style.width).toBeUndefined();
  });

  describe('D1 default: edge/adaptive-height mode retired', () => {
    test('expand() never sends SET_EDGE_MODE', () => {
      setInnerWidth(1024);
      const w = makeWidget();
      w.expand();

      expect(w._sentCommands.some((c) => c.action === 'SET_EDGE_MODE')).toBe(false);
    });

    test('MESSAGE_SENT event no longer resizes the shell or sends SET_EDGE_MODE', () => {
      setInnerWidth(1024);
      const w = makeWidget();
      w.expand();
      const before = { ...w.container.style };

      w.handlePicassoEvent({ event: 'MESSAGE_SENT' });

      expect(w._sentCommands.some((c) => c.action === 'SET_EDGE_MODE')).toBe(false);
      expect(w.container.style).toEqual(before);
    });

    test('SESSION_CLEARED event no longer resizes the shell or sends SET_EDGE_MODE', () => {
      setInnerWidth(1024);
      const w = makeWidget();
      w.expand();
      const before = { ...w.container.style };

      w.handlePicassoEvent({ event: 'SESSION_CLEARED' });

      expect(w._sentCommands.some((c) => c.action === 'SET_EDGE_MODE')).toBe(false);
      expect(w.container.style).toEqual(before);
    });

    test('widget-host.js source has no remaining SET_EDGE_MODE / isActive / activateSession / deactivateSession', () => {
      const source = fs.readFileSync(path.join(__dirname, '../widget-host.js'), 'utf8');

      expect(source).not.toMatch(/SET_EDGE_MODE/);
      expect(source).not.toMatch(/isActive/);
      expect(source).not.toMatch(/activateSession/);
      expect(source).not.toMatch(/deactivateSession/);
    });
  });
});
