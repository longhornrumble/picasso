/**
 * Chip-dispatch parity — MessageBubble's action-chip pills vs. WelcomeView's
 * menu rows (W3.1).
 *
 * HAIRLINE_WORKPLAN.md W3.1 guardrail (FROZEN): "chip dispatch payloads
 * (`action_chip_triggered`, `target_branch`, all chip metadata) byte-
 * identical [to] current." WelcomeView.jsx deliberately does NOT import
 * MessageBubble's `handleActionClick` (MessageBubble.jsx is single-owner,
 * HAIRLINE_WORKPLAN.md W2.2) — it carries its own copy of the same
 * "send_query" dispatch branch (the only branch `action_chips.default_chips`
 * can reach; see TENANT_CONFIG_SCHEMA.md — default_chips have no `action`
 * field). This test is the parity proof: it renders BOTH components against
 * the SAME chip fixture, through the SAME `ChatContext` (so both call the
 * exact same mocked `addMessage`), and asserts the captured payloads —
 * and the ACTION_CHIP_CLICKED analytics payloads — are deep-equal.
 *
 * If MessageBubble.jsx's `handleActionClick` ever changes shape, this test
 * goes red until WelcomeView.jsx's `dispatchChip` is updated to match.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import MessageBubble from '../MessageBubble';
import WelcomeView from '../WelcomeView';
import FormModeContext from '../../../context/FormModeContext';
import { ChatContext } from '../../../context/shared/ChatContext';

const mockUseConfig = jest.fn();
jest.mock('../../../hooks/useConfig', () => ({
  useConfig: (...args) => mockUseConfig(...args),
}));

function setConfig(config) {
  mockUseConfig.mockReturnValue({ config });
}

const mockFormModeContext = {
  isFormMode: false,
  isSuspended: false,
  currentFormId: null,
  formConfig: null,
  startFormWithConfig: jest.fn(),
  resumeForm: jest.fn(),
  cancelForm: jest.fn(),
};

function renderBubbleChip(chip, addMessage) {
  const chatContext = { messages: [], isTyping: false, addMessage, sendMessage: jest.fn() };
  // MessageBubble also calls useConfig() (for unrelated rendering concerns —
  // e.g. action-chip max_display slicing); give it a minimal config so the
  // destructure doesn't throw. Not the same config object as the WelcomeView
  // side on purpose — this test isolates config; the two views legitimately
  // read config differently (message.actions vs. config.action_chips).
  setConfig({ action_chips: { max_display: 5 } });
  return render(
    <FormModeContext.Provider value={mockFormModeContext}>
      <ChatContext.Provider value={chatContext}>
        <MessageBubble role="assistant" content="" actions={[chip]} renderMode="static" />
      </ChatContext.Provider>
    </FormModeContext.Provider>
  );
}

function renderWelcomeChip(chip, addMessage) {
  const chatContext = { messages: [], isTyping: false, addMessage, sendMessage: jest.fn() };
  setConfig({
    action_chips: { enabled: true, show_on_welcome: true, default_chips: { c: chip } },
  });
  return render(
    <ChatContext.Provider value={chatContext}>
      <WelcomeView onOpenQuestions={jest.fn()} />
    </ChatContext.Provider>
  );
}

beforeEach(() => {
  mockUseConfig.mockReset();
  window.notifyParentEvent = jest.fn();
});

afterEach(() => {
  delete window.notifyParentEvent;
});

describe('Chip dispatch parity: MessageBubble action-chip pill vs. WelcomeView menu row', () => {
  it('target_branch chip: addMessage payload is byte-identical', () => {
    const chip = { label: 'Volunteer', value: 'Tell me about volunteering', target_branch: 'volunteer_interest' };

    const bubbleAddMessage = jest.fn();
    const { unmount: unmountBubble } = renderBubbleChip(chip, bubbleAddMessage);
    fireEvent.click(screen.getByRole('button', { name: 'Volunteer' }));
    unmountBubble();

    const welcomeAddMessage = jest.fn();
    const { unmount: unmountWelcome } = renderWelcomeChip(chip, welcomeAddMessage);
    fireEvent.click(screen.getByRole('button', { name: 'Volunteer' }));
    unmountWelcome();

    expect(bubbleAddMessage).toHaveBeenCalledTimes(1);
    expect(welcomeAddMessage).toHaveBeenCalledTimes(1);
    expect(welcomeAddMessage.mock.calls[0][0]).toEqual(bubbleAddMessage.mock.calls[0][0]);

    // Pin the actual shape too, not just cross-equality, so a bug shared by
    // both sides can't hide behind "they agree with each other."
    expect(bubbleAddMessage).toHaveBeenCalledWith({
      role: 'user',
      content: 'Tell me about volunteering',
      metadata: {
        action_chip_triggered: true,
        target_branch: 'volunteer_interest',
        action_chip_id: 'Volunteer',
      },
    });
  });

  it('no-target_branch chip: addMessage payload is byte-identical (no metadata key)', () => {
    const chip = { label: 'Contact us', value: 'How can I contact you?' };

    const bubbleAddMessage = jest.fn();
    const { unmount: unmountBubble } = renderBubbleChip(chip, bubbleAddMessage);
    fireEvent.click(screen.getByRole('button', { name: 'Contact us' }));
    unmountBubble();

    const welcomeAddMessage = jest.fn();
    const { unmount: unmountWelcome } = renderWelcomeChip(chip, welcomeAddMessage);
    fireEvent.click(screen.getByRole('button', { name: 'Contact us' }));
    unmountWelcome();

    expect(welcomeAddMessage.mock.calls[0][0]).toEqual(bubbleAddMessage.mock.calls[0][0]);
    expect(bubbleAddMessage).toHaveBeenCalledWith({ role: 'user', content: 'How can I contact you?' });
  });

  it('explicit target_branch: null chip (falls back to cta_settings.fallback_branch server-side): no metadata key either side', () => {
    const chip = { label: 'Learn More', value: 'Tell me more about your programs', target_branch: null };

    const bubbleAddMessage = jest.fn();
    const { unmount: unmountBubble } = renderBubbleChip(chip, bubbleAddMessage);
    fireEvent.click(screen.getByRole('button', { name: 'Learn More' }));
    unmountBubble();

    const welcomeAddMessage = jest.fn();
    const { unmount: unmountWelcome } = renderWelcomeChip(chip, welcomeAddMessage);
    fireEvent.click(screen.getByRole('button', { name: 'Learn More' }));
    unmountWelcome();

    expect(welcomeAddMessage.mock.calls[0][0]).toEqual(bubbleAddMessage.mock.calls[0][0]);
    expect(bubbleAddMessage.mock.calls[0][0]).not.toHaveProperty('metadata');
  });

  it('ACTION_CHIP_CLICKED analytics payload is byte-identical', () => {
    const chip = { label: 'Donate', value: 'How can I donate?', target_branch: 'donation_interest' };

    const bubbleNotify = jest.fn();
    window.notifyParentEvent = bubbleNotify;
    const { unmount: unmountBubble } = renderBubbleChip(chip, jest.fn());
    fireEvent.click(screen.getByRole('button', { name: 'Donate' }));
    unmountBubble();

    const welcomeNotify = jest.fn();
    window.notifyParentEvent = welcomeNotify;
    const { unmount: unmountWelcome } = renderWelcomeChip(chip, jest.fn());
    fireEvent.click(screen.getByRole('button', { name: 'Donate' }));
    unmountWelcome();

    expect(bubbleNotify).toHaveBeenCalledWith('ACTION_CHIP_CLICKED', {
      chip_id: 'Donate',
      chip_label: 'Donate',
      target_branch: 'donation_interest',
      chip_action: 'send_query',
    });
    expect(welcomeNotify.mock.calls[0]).toEqual(bubbleNotify.mock.calls[0]);
  });
});
