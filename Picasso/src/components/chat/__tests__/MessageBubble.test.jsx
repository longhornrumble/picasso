/**
 * MessageBubble Component Tests
 *
 * Tests for ShowcaseCard integration in MessageBubble
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import MessageBubble from '../MessageBubble';
import { ConfigProvider } from '../../../context/ConfigProvider';
import FormModeContext from '../../../context/FormModeContext';
import { ChatContext } from '../../../context/shared/ChatContext';

// Mock dependencies
jest.mock('../../../utils/streamingRegistry', () => ({
  streamingRegistry: {
    subscribe: jest.fn(),
    isActive: jest.fn(() => false),
    getAccumulated: jest.fn(() => '')
  }
}));

jest.mock('dompurify', () => ({
  sanitize: jest.fn((html) => html),
  __esModule: true,
  default: {
    sanitize: jest.fn((html) => html)
  }
}));

jest.mock('marked', () => ({
  marked: {
    parse: jest.fn((text) => text),
    setOptions: jest.fn()
  }
}));

// Mock config
const mockConfig = {
  tenant_id: 'test_tenant',
  branding: {
    bot_name: 'Test Bot',
    avatar_url: 'https://example.com/avatar.png'
  },
  action_chips: {
    enabled: true,
    max_display: 5
  }
};

// Mock form mode context
const mockFormModeContext = {
  isFormMode: false,
  isSuspended: false,
  currentFormId: null,
  formConfig: null,
  startFormWithConfig: jest.fn(),
  resumeForm: jest.fn(),
  cancelForm: jest.fn()
};

// Mock chat context
const mockChatContext = {
  messages: [],
  isTyping: false,
  sendMessage: jest.fn(),
  addMessage: jest.fn(),
  clearMessages: jest.fn(),
  retryMessage: jest.fn()
};

// Helper to render with context providers
const renderWithProviders = (component) => {
  return render(
    <ConfigProvider>
      <FormModeContext.Provider value={mockFormModeContext}>
        <ChatContext.Provider value={mockChatContext}>
          {component}
        </ChatContext.Provider>
      </FormModeContext.Provider>
    </ConfigProvider>
  );
};

describe('MessageBubble - ShowcaseCard Integration', () => {
  it('should render ShowcaseCard when showcaseCard prop is provided', () => {
    const showcaseCard = {
      id: 'holiday_2025',
      type: 'campaign',
      name: 'Holiday Giving Guide 2025',
      tagline: 'Make a difference this holiday season',
      description: 'Support our community programs',
      ctaButtons: {
        primary: {
          id: 'donate',
          label: 'Donate Now',
          action: 'external_link',
          url: 'https://example.com/donate'
        },
        secondary: [
          {
            id: 'learn_more',
            label: 'Learn More',
            action: 'send_query',
            query: 'Tell me more about this campaign'
          }
        ]
      }
    };

    renderWithProviders(
      <MessageBubble
        role="assistant"
        content="Check out our holiday campaign!"
        showcaseCard={showcaseCard}
        renderMode="static"
      />
    );

    // Verify showcase card is rendered
    expect(screen.getByText('Holiday Giving Guide 2025')).toBeInTheDocument();
    expect(screen.getByText('Make a difference this holiday season')).toBeInTheDocument();
    expect(screen.getByText('Support our community programs')).toBeInTheDocument();
  });

  it('should not render ShowcaseCard for user messages', () => {
    const showcaseCard = {
      id: 'test_card',
      type: 'program',
      name: 'Test Program',
      tagline: 'Test tagline',
      description: 'Test description',
      ctaButtons: {
        primary: {
          id: 'test_cta',
          label: 'Test CTA',
          action: 'send_query',
          query: 'test'
        }
      }
    };

    renderWithProviders(
      <MessageBubble
        role="user"
        content="Hello"
        showcaseCard={showcaseCard}
        renderMode="static"
      />
    );

    // Showcase card should not be rendered for user messages
    expect(screen.queryByText('Test Program')).not.toBeInTheDocument();
  });

  it('should not render ShowcaseCard when showcaseCard prop is null', () => {
    renderWithProviders(
      <MessageBubble
        role="assistant"
        content="Hello"
        showcaseCard={null}
        renderMode="static"
      />
    );

    // No showcase card elements should be present
    const showcaseCards = document.querySelectorAll('.hairline-showcase');
    expect(showcaseCards.length).toBe(0);
  });

  it('should render both CTAs and ShowcaseCard when both are provided', () => {
    const ctaButtons = [
      {
        id: 'apply',
        label: 'Apply Now',
        action: 'start_form',
        formId: 'volunteer_apply'
      }
    ];

    const showcaseCard = {
      id: 'volunteer_program',
      type: 'program',
      name: 'Volunteer Program',
      tagline: 'Make a difference',
      description: 'Join our team',
      ctaButtons: {
        primary: {
          id: 'apply_showcase',
          label: 'Apply from Showcase',
          action: 'start_form',
          formId: 'volunteer_apply'
        }
      }
    };

    renderWithProviders(
      <MessageBubble
        role="assistant"
        content="We have volunteer opportunities!"
        ctaButtons={ctaButtons}
        showcaseCard={showcaseCard}
        renderMode="static"
      />
    );

    // Both regular CTAs and showcase card should be present
    expect(screen.getByText('Apply Now')).toBeInTheDocument();
    expect(screen.getByText('Volunteer Program')).toBeInTheDocument();
    expect(screen.getByText('Apply from Showcase')).toBeInTheDocument();
  });

  it('should pass handleCtaClick to ShowcaseCard CTAs', () => {
    const onCTAClick = jest.fn();

    const showcaseCard = {
      id: 'test_card',
      type: 'event',
      name: 'Test Event',
      tagline: 'Join us',
      description: 'Event description',
      ctaButtons: {
        primary: {
          id: 'register',
          label: 'Register',
          action: 'external_link',
          url: 'https://example.com/register'
        }
      }
    };

    const { container } = renderWithProviders(
      <MessageBubble
        role="assistant"
        content="Join our event!"
        showcaseCard={showcaseCard}
        renderMode="static"
      />
    );

    // Verify ShowcaseCard component is rendered with data
    const showcaseCardElement = container.querySelector('.hairline-showcase');
    expect(showcaseCardElement).toBeInTheDocument();
    expect(showcaseCardElement).toHaveAttribute('data-showcase-id', 'test_card');
    expect(showcaseCardElement).toHaveAttribute('data-showcase-type', 'event');
  });
});

describe('MessageBubble - scheduling dispatch branches', () => {
  let consoleLogSpy;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockFormModeContext.startFormWithConfig.mockClear();
    mockFormModeContext.resumeForm.mockClear();
    mockFormModeContext.cancelForm.mockClear();
    mockChatContext.sendMessage.mockClear();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  const findSchedulingLog = (action) =>
    consoleLogSpy.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes(`${action} action received`)
    );

  // WS-C12 (§B16d): start_scheduling no longer short-circuits — it dispatches a
  // new-booking turn carrying `scheduling_intent: 'new_booking'`. It must still
  // log and must NOT fire any form handler.
  it('dispatches a new_booking turn on start_scheduling (without firing form handlers)', () => {
    const ctaButtons = [
      {
        id: 'book_intake',
        label: 'Schedule a call',
        action: 'start_scheduling',
      },
    ];

    renderWithProviders(
      <MessageBubble
        role="assistant"
        content="Ready to book?"
        ctaButtons={ctaButtons}
        renderMode="static"
      />
    );

    screen.getByText('Schedule a call').click();

    const logCall = findSchedulingLog('start_scheduling');
    expect(logCall).toBeDefined();
    expect(logCall[1]).toEqual({ cta_id: 'book_intake', label: 'Schedule a call' });

    expect(mockFormModeContext.startFormWithConfig).not.toHaveBeenCalled();
    expect(mockFormModeContext.resumeForm).not.toHaveBeenCalled();
    expect(mockFormModeContext.cancelForm).not.toHaveBeenCalled();

    // Sends the new-booking signal on this turn (label is the fallback turn text).
    expect(mockChatContext.sendMessage).toHaveBeenCalledTimes(1);
    const [text, metadata] = mockChatContext.sendMessage.mock.calls[0];
    expect(text).toBe('Schedule a call');
    expect(metadata).toMatchObject({ scheduling_intent: 'new_booking' });
  });

  it('logs and short-circuits on resume_scheduling without firing form or chat handlers', () => {
    const ctaButtons = [
      {
        id: 'resume_booking',
        label: 'Pick up where you left off',
        action: 'resume_scheduling',
      },
    ];

    renderWithProviders(
      <MessageBubble
        role="assistant"
        content="Want to continue?"
        ctaButtons={ctaButtons}
        renderMode="static"
      />
    );

    screen.getByText('Pick up where you left off').click();

    const logCall = findSchedulingLog('resume_scheduling');
    expect(logCall).toBeDefined();
    expect(logCall[1]).toEqual({
      cta_id: 'resume_booking',
      label: 'Pick up where you left off',
    });

    expect(mockFormModeContext.startFormWithConfig).not.toHaveBeenCalled();
    expect(mockFormModeContext.resumeForm).not.toHaveBeenCalled();
    expect(mockFormModeContext.cancelForm).not.toHaveBeenCalled();
    expect(mockChatContext.sendMessage).not.toHaveBeenCalled();
  });
});

describe('MessageBubble - dispatch hardening (audit B1/B2 regression)', () => {
  let consoleLogSpy;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockFormModeContext.startFormWithConfig.mockClear();
    mockFormModeContext.cancelForm.mockClear();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('switch_form must NOT mutate cta.action (audit B1) — the same cta object can be referenced elsewhere in React state', () => {
    const cta = {
      id: 'switch_apply',
      label: 'Switch form',
      action: 'switch_form',
      formId: 'volunteer_apply',
      cancelPreviousForm: true,
    };

    renderWithProviders(
      <MessageBubble
        role="assistant"
        content="Want to switch forms?"
        ctaButtons={[cta]}
        renderMode="static"
      />
    );

    screen.getByText('Switch form').click();

    // The switch_form branch must have executed (proving the click reached the handler)
    expect(mockFormModeContext.cancelForm).toHaveBeenCalled();
    // …but the cta object must be untouched (no prop mutation).
    expect(cta.action).toBe('switch_form');
  });

  it('handleCtaClick must NOT dump full cta via JSON.stringify (audit B2) — operator-configured values must not leak to browser console', () => {
    const cta = {
      id: 'send_q',
      label: 'Ask',
      action: 'send_query',
      query: 'sensitive-looking-operator-string',
    };

    renderWithProviders(
      <MessageBubble
        role="assistant"
        content="Question?"
        ctaButtons={[cta]}
        renderMode="static"
      />
    );

    screen.getByText('Ask').click();

    const fullDumpCall = consoleLogSpy.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('CTA clicked - full data')
    );
    expect(fullDumpCall).toBeUndefined();
  });
});

describe('MessageBubble - Accessibility', () => {
  it('should have proper ARIA attributes on ShowcaseCard', () => {
    const showcaseCard = {
      id: 'a11y_test',
      type: 'program',
      name: 'Accessibility Test',
      tagline: 'Testing accessibility',
      description: 'This tests ARIA attributes',
      ctaButtons: {
        primary: {
          id: 'test_cta',
          label: 'Test',
          action: 'send_query',
          query: 'test'
        }
      }
    };

    const { container } = renderWithProviders(
      <MessageBubble
        role="assistant"
        content="Testing accessibility"
        showcaseCard={showcaseCard}
        renderMode="static"
      />
    );

    const showcaseCardElement = container.querySelector('.hairline-showcase');

    // Check ARIA attributes
    expect(showcaseCardElement).toHaveAttribute('role', 'article');
    expect(showcaseCardElement).toHaveAttribute('aria-labelledby', 'showcase-a11y_test-title');
  });
});
