/**
 * WelcomeView Component Tests — Hairline welcome view (W3.1)
 *
 * DESIGN_SPEC.md "1. Welcome (`10a Welcome`)": greeting (fixed copy, D7) +
 * welcome_message paragraph + menu card from action_chips.default_chips
 * with an appended fixed "Common questions" row.
 *
 * The chip-dispatch payload assertions here are the FROZEN-behavior half of
 * the contract (HAIRLINE_WORKPLAN.md ground rule #2 + W3.1 guardrails):
 * payloads must be byte-identical to today's action-chip pills. The other
 * half — proving WelcomeView's dispatch really does match MessageBubble's
 * current `handleActionClick` — lives in the dedicated parity test
 * `welcomeMenuChipDispatchParity.test.jsx`, which renders both components
 * side by side.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import WelcomeView from '../WelcomeView';

const mockUseConfig = jest.fn();
jest.mock('../../../hooks/useConfig', () => ({
  useConfig: (...args) => mockUseConfig(...args),
}));

const mockUseChat = jest.fn();
jest.mock('../../../hooks/useChat', () => ({
  useChat: (...args) => mockUseChat(...args),
}));

function setConfig(config) {
  mockUseConfig.mockReturnValue({ config });
}

function setChat(overrides = {}) {
  mockUseChat.mockReturnValue({
    addMessage: jest.fn(),
    isTyping: false,
    ...overrides,
  });
}

beforeEach(() => {
  mockUseConfig.mockReset();
  mockUseChat.mockReset();
  window.notifyParentEvent = jest.fn();
});

afterEach(() => {
  delete window.notifyParentEvent;
});

describe('WelcomeView — greeting + welcome paragraph (D7 fixed greeting)', () => {
  it('renders the fixed greeting copy regardless of config', () => {
    setConfig({});
    setChat();
    render(<WelcomeView onOpenQuestions={jest.fn()} />);
    expect(screen.getByText('Hi there 👋')).toBeInTheDocument();
  });

  it('renders the welcome_message paragraph when configured', () => {
    setConfig({ welcome_message: 'Welcome to Atlanta Angels.' });
    setChat();
    render(<WelcomeView onOpenQuestions={jest.fn()} />);
    expect(screen.getByText('Welcome to Atlanta Angels.')).toBeInTheDocument();
  });

  it('tolerates a missing welcome_message — omits the paragraph, still shows greeting + menu', () => {
    setConfig({});
    setChat();
    render(<WelcomeView onOpenQuestions={jest.fn()} />);
    expect(screen.getByText('Hi there 👋')).toBeInTheDocument();
    expect(screen.getByText('Common questions')).toBeInTheDocument();
  });

  it('tolerates config being null (pre-fetch state)', () => {
    setConfig(null);
    setChat();
    expect(() => render(<WelcomeView onOpenQuestions={jest.fn()} />)).not.toThrow();
    expect(screen.getByText('Hi there 👋')).toBeInTheDocument();
  });
});

describe('WelcomeView — menu card rows', () => {
  it('renders default_chips (v1.4.1 dictionary format) as menu rows, in insertion order', () => {
    setConfig({
      action_chips: {
        enabled: true,
        show_on_welcome: true,
        default_chips: {
          mentoring: { label: 'Learn about mentoring', value: 'Tell me about mentoring', target_branch: 'mentoring_program' },
          sponsor: { label: 'Sponsor a family', value: 'How do I sponsor a family?', target_branch: null },
        },
      },
    });
    setChat();
    render(<WelcomeView onOpenQuestions={jest.fn()} />);

    const rows = screen.getAllByRole('button').map((el) => el.textContent.replace('→', ''));
    expect(rows).toEqual(['Learn about mentoring', 'Sponsor a family', 'Common questions']);
  });

  it('renders default_chips (legacy v1.3 array format)', () => {
    setConfig({
      action_chips: {
        enabled: true,
        show_on_welcome: true,
        default_chips: [{ label: 'Volunteer', value: 'Tell me about volunteering' }],
      },
    });
    setChat();
    render(<WelcomeView onOpenQuestions={jest.fn()} />);
    expect(screen.getByText('Volunteer')).toBeInTheDocument();
  });

  it('respects max_display when slicing chips', () => {
    setConfig({
      action_chips: {
        enabled: true,
        show_on_welcome: true,
        max_display: 1,
        default_chips: {
          a: { label: 'A', value: 'a' },
          b: { label: 'B', value: 'b' },
        },
      },
    });
    setChat();
    render(<WelcomeView onOpenQuestions={jest.fn()} />);
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.queryByText('B')).not.toBeInTheDocument();
  });

  it('hides tenant chips when action_chips.enabled is false, but still shows Common questions', () => {
    setConfig({
      action_chips: {
        enabled: false,
        show_on_welcome: true,
        default_chips: { a: { label: 'A', value: 'a' } },
      },
    });
    setChat();
    render(<WelcomeView onOpenQuestions={jest.fn()} />);
    expect(screen.queryByText('A')).not.toBeInTheDocument();
    expect(screen.getByText('Common questions')).toBeInTheDocument();
  });

  it('hides tenant chips when show_on_welcome is false, but still shows Common questions', () => {
    setConfig({
      action_chips: {
        enabled: true,
        show_on_welcome: false,
        default_chips: { a: { label: 'A', value: 'a' } },
      },
    });
    setChat();
    render(<WelcomeView onOpenQuestions={jest.fn()} />);
    expect(screen.queryByText('A')).not.toBeInTheDocument();
    expect(screen.getByText('Common questions')).toBeInTheDocument();
  });

  it('always renders the "Common questions" row last, even with zero tenant chips', () => {
    setConfig({});
    setChat();
    render(<WelcomeView onOpenQuestions={jest.fn()} />);
    const rows = screen.getAllByRole('button');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('Common questions');
  });

  it('renders NO menu card at all when there are zero chips AND quick_help is disabled (W6.3 F4)', () => {
    // A minimal/fallback config (action_chips.enabled false, quick_help
    // enabled false) must not leave an empty bordered card — the stray
    // hairline box observed in the W6.3 fidelity audit.
    const { container } = (() => {
      setConfig({ action_chips: { enabled: false }, quick_help: { enabled: false } });
      setChat();
      return render(<WelcomeView onOpenQuestions={jest.fn()} />);
    })();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(container.querySelector('.hairline-menu-card')).toBeNull();
  });

  it('menu rows are real buttons with aria-labels', () => {
    setConfig({
      action_chips: {
        enabled: true,
        show_on_welcome: true,
        default_chips: { a: { label: 'Contact us', value: 'contact' } },
      },
    });
    setChat();
    render(<WelcomeView onOpenQuestions={jest.fn()} />);
    const button = screen.getByRole('button', { name: 'Contact us' });
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('aria-label', 'Contact us');
  });
});

describe('WelcomeView — chip dispatch (FROZEN payload contract)', () => {
  function chipConfig(chip) {
    return { action_chips: { enabled: true, show_on_welcome: true, default_chips: { c: chip } } };
  }

  it('send_query path (no target_branch): addMessage gets {role, content} with NO metadata', () => {
    const addMessage = jest.fn();
    setConfig(chipConfig({ label: 'Contact us', value: 'How can I contact you?' }));
    setChat({ addMessage, isTyping: false });
    render(<WelcomeView onOpenQuestions={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Contact us' }));

    expect(addMessage).toHaveBeenCalledTimes(1);
    expect(addMessage).toHaveBeenCalledWith({ role: 'user', content: 'How can I contact you?' });
  });

  it('send_query path with target_branch: addMessage gets routing metadata (byte-identical shape to MessageBubble)', () => {
    const addMessage = jest.fn();
    setConfig(
      chipConfig({ label: 'Volunteer', value: 'Tell me about volunteering', target_branch: 'volunteer_interest' })
    );
    setChat({ addMessage, isTyping: false });
    render(<WelcomeView onOpenQuestions={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Volunteer' }));

    expect(addMessage).toHaveBeenCalledWith({
      role: 'user',
      content: 'Tell me about volunteering',
      metadata: {
        action_chip_triggered: true,
        target_branch: 'volunteer_interest',
        action_chip_id: 'Volunteer', // no chip.id in default_chips shape — falls back to label
      },
    });
  });

  it('falls back content to label when value is absent', () => {
    const addMessage = jest.fn();
    setConfig(chipConfig({ label: 'Donate' }));
    setChat({ addMessage, isTyping: false });
    render(<WelcomeView onOpenQuestions={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Donate' }));
    expect(addMessage).toHaveBeenCalledWith({ role: 'user', content: 'Donate' });
  });

  it('emits ACTION_CHIP_CLICKED analytics with the same shape as the current chip pills', () => {
    setConfig(chipConfig({ label: 'Donate', value: 'How can I donate?', target_branch: 'donation_interest' }));
    setChat();
    render(<WelcomeView onOpenQuestions={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Donate' }));

    expect(window.notifyParentEvent).toHaveBeenCalledWith('ACTION_CHIP_CLICKED', {
      chip_id: 'Donate',
      chip_label: 'Donate',
      target_branch: 'donation_interest',
      chip_action: 'send_query',
    });
  });

  it('does nothing while isTyping is true (matches the disabled/no-dispatch behavior of today\'s chips)', () => {
    const addMessage = jest.fn();
    setConfig(chipConfig({ label: 'Donate', value: 'How can I donate?' }));
    setChat({ addMessage, isTyping: true });
    render(<WelcomeView onOpenQuestions={jest.fn()} />);

    const button = screen.getByRole('button', { name: 'Donate' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(addMessage).not.toHaveBeenCalled();
    expect(window.notifyParentEvent).not.toHaveBeenCalled();
  });
});

describe('WelcomeView — "Common questions" row', () => {
  it('calls onOpenQuestions when clicked (W3.2 wires the real overlay; this item wires the row)', () => {
    const onOpenQuestions = jest.fn();
    setConfig({});
    setChat();
    render(<WelcomeView onOpenQuestions={onOpenQuestions} />);

    fireEvent.click(screen.getByRole('button', { name: 'Common questions' }));
    expect(onOpenQuestions).toHaveBeenCalledTimes(1);
  });

  it('does not dispatch a chat message when clicked', () => {
    const addMessage = jest.fn();
    setConfig({});
    setChat({ addMessage });
    render(<WelcomeView onOpenQuestions={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Common questions' }));
    expect(addMessage).not.toHaveBeenCalled();
  });

  // W3.2 done-when: "quick_help.enabled=false hides the menu row."
  it('renders the row when quick_help.enabled is true', () => {
    setConfig({ quick_help: { enabled: true } });
    setChat();
    render(<WelcomeView onOpenQuestions={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Common questions' })).toBeInTheDocument();
  });

  it('renders the row when quick_help is entirely absent from config (tolerant default true)', () => {
    setConfig({});
    setChat();
    render(<WelcomeView onOpenQuestions={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Common questions' })).toBeInTheDocument();
  });

  it('hides the row when quick_help.enabled is explicitly false', () => {
    setConfig({ quick_help: { enabled: false, prompts: ['Q1?'] } });
    setChat();
    render(<WelcomeView onOpenQuestions={jest.fn()} />);
    expect(screen.queryByRole('button', { name: 'Common questions' })).not.toBeInTheDocument();
  });
});
