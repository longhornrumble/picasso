/**
 * ResponseActions — copy + inert thumbs row (W2.6)
 *
 * DESIGN_SPEC.md screens 3/4 ("Response actions" / "Feedback given"): copy
 * is functional (Clipboard API + "Copied" ~2s confirm on the reply's plain
 * text, HTML stripped); thumbs are a local, mutually-exclusive visual
 * toggle only — the feedback POST is W5.1 (decision D3: post-flip
 * fast-follow gated on a PII/AI-governance advisory pass). This suite
 * asserts: (1) copy writes plain text to the clipboard and shows/reverts
 * "Copied"; (2) copy fails gracefully when the Clipboard API is missing or
 * rejects; (3) thumbs toggle mutually-exclusively with correct
 * `aria-pressed`, and never trigger a network call.
 */
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ResponseActions from '../ResponseActions';

function setClipboard(writeTextImpl) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: writeTextImpl },
    configurable: true,
  });
}

function removeClipboard() {
  Object.defineProperty(navigator, 'clipboard', {
    value: undefined,
    configurable: true,
  });
}

describe('ResponseActions — copy (W2.6)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    removeClipboard();
  });

  test('copies the reply\'s plain text (HTML stripped) and shows "Copied"', async () => {
    const writeTextMock = jest.fn().mockResolvedValue(undefined);
    setClipboard(writeTextMock);

    render(<ResponseActions replyHtml="<p>Hello <strong>world</strong></p>" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });

    expect(writeTextMock).toHaveBeenCalledWith('Hello world');
    expect(screen.getByText('Copied')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Copied');
  });

  test('"Copied" reverts after ~2s', async () => {
    setClipboard(jest.fn().mockResolvedValue(undefined));

    render(<ResponseActions replyHtml="<p>Hi</p>" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });
    expect(screen.getByText('Copied')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(2100);
    });

    expect(screen.queryByText('Copied')).not.toBeInTheDocument();
  });

  test('clipboard write failure (e.g. permission denied) is handled gracefully — no crash, no "Copied"', async () => {
    setClipboard(jest.fn().mockRejectedValue(new Error('permission denied')));

    render(<ResponseActions replyHtml="<p>Hi</p>" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });

    expect(screen.queryByText('Copied')).not.toBeInTheDocument();
  });

  test('clipboard API unavailable is handled gracefully — no crash, no "Copied"', async () => {
    removeClipboard();

    render(<ResponseActions replyHtml="<p>Hi</p>" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });

    expect(screen.queryByText('Copied')).not.toBeInTheDocument();
  });

  test('missing/undefined replyHtml does not throw — copies empty string', async () => {
    const writeTextMock = jest.fn().mockResolvedValue(undefined);
    setClipboard(writeTextMock);

    render(<ResponseActions />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });

    expect(writeTextMock).toHaveBeenCalledWith('');
    expect(screen.getByText('Copied')).toBeInTheDocument();
  });

  test('unmounting while the "Copied" revert timeout is pending does not warn or throw', async () => {
    setClipboard(jest.fn().mockResolvedValue(undefined));

    const { unmount } = render(<ResponseActions replyHtml="<p>Hi</p>" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });
    expect(screen.getByText('Copied')).toBeInTheDocument();

    // Unmount before the 2s revert timeout fires, then let it fire — must not
    // attempt a setState-after-unmount (the cleanup effect clears the timer).
    expect(() => {
      unmount();
      act(() => {
        jest.advanceTimersByTime(2100);
      });
    }).not.toThrow();
  });
});

describe('ResponseActions — thumbs are inert (D3 fast-follow, W5.1)', () => {
  afterEach(() => {
    delete global.fetch;
  });

  test('mutually exclusive toggle with correct aria-pressed', () => {
    render(<ResponseActions replyHtml="<p>Hi</p>" />);

    const up = screen.getByRole('button', { name: 'Give positive feedback' });
    const down = screen.getByRole('button', { name: 'Give negative feedback' });

    expect(up).toHaveAttribute('aria-pressed', 'false');
    expect(down).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(up);
    expect(up).toHaveAttribute('aria-pressed', 'true');
    expect(down).toHaveAttribute('aria-pressed', 'false');

    // Selecting the other thumb deselects the first (mutually exclusive).
    fireEvent.click(down);
    expect(up).toHaveAttribute('aria-pressed', 'false');
    expect(down).toHaveAttribute('aria-pressed', 'true');

    // Tapping the selected thumb again clears it.
    fireEvent.click(down);
    expect(down).toHaveAttribute('aria-pressed', 'false');
  });

  test('never issues a network call (no POST — backend is W5.1)', () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    render(<ResponseActions replyHtml="<p>Hi</p>" />);

    fireEvent.click(screen.getByRole('button', { name: 'Give positive feedback' }));
    fireEvent.click(screen.getByRole('button', { name: 'Give negative feedback' }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('copy, thumbs-up, and thumbs-down buttons all have aria-labels', () => {
    render(<ResponseActions replyHtml="<p>Hi</p>" />);

    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Give positive feedback' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Give negative feedback' })).toBeInTheDocument();
  });

  test('all three buttons carry hover text (title) matching their accessible name', () => {
    // Chris request 2026-07-03: the icons need hover tooltips — "Copy",
    // "Give positive feedback", "Give negative feedback".
    render(<ResponseActions replyHtml="<p>Hi</p>" />);

    expect(screen.getByRole('button', { name: 'Copy' })).toHaveAttribute('title', 'Copy');
    expect(screen.getByRole('button', { name: 'Give positive feedback' })).toHaveAttribute(
      'title',
      'Give positive feedback'
    );
    expect(screen.getByRole('button', { name: 'Give negative feedback' })).toHaveAttribute(
      'title',
      'Give negative feedback'
    );
  });
});
