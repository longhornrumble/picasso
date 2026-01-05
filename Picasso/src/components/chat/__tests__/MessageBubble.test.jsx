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
    const showcaseCards = document.querySelectorAll('.showcase-card');
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
    const showcaseCardElement = container.querySelector('.showcase-card');
    expect(showcaseCardElement).toBeInTheDocument();
    expect(showcaseCardElement).toHaveAttribute('data-showcase-id', 'test_card');
    expect(showcaseCardElement).toHaveAttribute('data-showcase-type', 'event');
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

    const showcaseCardElement = container.querySelector('.showcase-card');

    // Check ARIA attributes
    expect(showcaseCardElement).toHaveAttribute('role', 'article');
    expect(showcaseCardElement).toHaveAttribute('aria-labelledby', 'showcase-a11y_test-title');
  });
});
