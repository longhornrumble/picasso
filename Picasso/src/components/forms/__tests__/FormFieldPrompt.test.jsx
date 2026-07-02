/**
 * FormFieldPrompt — Hairline forms suite tests (W4.1)
 *
 * Conversational forms are an UNMOCKED surface (HAIRLINE_REDESIGN_MAPPING.md
 * §0 case 2 / §4 item 1) — no Turn 10 mock exists, so the appearance below
 * is a fresh Hairline treatment, not a restyle of the old look. These tests
 * assert the new `.hairline-form*` markup/classNames AND the frozen
 * behavioral contract that must survive the re-skin unchanged: field
 * validation/submission dispatch (`submitField`), the eligibility-failure
 * and suspended-form states, the select-option dispatch table, and form
 * ARIA wiring (label↔input association, `aria-describedby`,
 * `role="alert" aria-live="polite"`).
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import FormFieldPrompt from '../FormFieldPrompt';
import { useFormMode } from '../../../context/FormModeContext';
import { useChat } from '../../../hooks/useChat';
import { useConfig } from '../../../hooks/useConfig';

jest.mock('../../../context/FormModeContext', () => ({
  useFormMode: jest.fn(),
}));

jest.mock('../../../hooks/useChat', () => ({
  useChat: jest.fn(),
}));

jest.mock('../../../hooks/useConfig', () => ({
  useConfig: jest.fn(),
}));

const baseChat = () => ({ addMessage: jest.fn(), sendMessage: jest.fn() });
const baseConfig = () => ({ config: { conversational_forms: {} } });

function makeFormMode(overrides = {}) {
  return {
    formConfig: { form_title: 'Volunteer application', fields: [] },
    getCurrentField: jest.fn(),
    getFormProgress: jest.fn(() => ({ currentStep: 1, totalSteps: 3, percentComplete: 33 })),
    validationErrors: {},
    cancelForm: jest.fn(),
    submitField: jest.fn(),
    startFormWithConfig: jest.fn(),
    isSuspended: false,
    ...overrides,
  };
}

describe('FormFieldPrompt — Hairline forms suite', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('returns null when there is no current field', () => {
    useFormMode.mockReturnValue(makeFormMode({ getCurrentField: jest.fn(() => null) }));
    useChat.mockReturnValue(baseChat());
    useConfig.mockReturnValue(baseConfig());

    const { container } = render(<FormFieldPrompt onCancel={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  describe('text field', () => {
    const textField = {
      id: 'first_name',
      type: 'text',
      prompt: "What's your first name?",
      required: true,
      placeholder: 'Type your answer...',
    };

    beforeEach(() => {
      useChat.mockReturnValue(baseChat());
      useConfig.mockReturnValue(baseConfig());
    });

    test('renders as a hairline form card with the field label wired to the input', () => {
      useFormMode.mockReturnValue(makeFormMode({ getCurrentField: jest.fn(() => textField) }));
      render(<FormFieldPrompt onCancel={jest.fn()} />);

      const card = screen.getByText('Volunteer application').closest('.hairline-form');
      expect(card).toBeInTheDocument();
      expect(card).not.toHaveClass('hairline-form--suspended');

      const input = screen.getByLabelText((content, el) => el?.id === 'field-first_name');
      expect(input).toBeInTheDocument();
      expect(input).toHaveClass('hairline-form-input');
    });

    test('required field shows an inline required mark next to the label', () => {
      useFormMode.mockReturnValue(makeFormMode({ getCurrentField: jest.fn(() => textField) }));
      render(<FormFieldPrompt onCancel={jest.fn()} />);

      const label = document.getElementById('label-first_name');
      expect(label.querySelector('.hairline-form-required-mark')).toBeInTheDocument();
    });

    test('progress track fill width reflects percentComplete', () => {
      useFormMode.mockReturnValue(
        makeFormMode({
          getCurrentField: jest.fn(() => textField),
          getFormProgress: jest.fn(() => ({ currentStep: 2, totalSteps: 4, percentComplete: 50 })),
        })
      );
      render(<FormFieldPrompt onCancel={jest.fn()} />);

      expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();
      const track = document.querySelector('.hairline-form-progress-track');
      const fill = track.querySelector('.hairline-form-progress-fill');
      expect(fill).toHaveStyle({ width: '50%' });
    });

    test('submit is disabled until there is input, and calls submitField with the trimmed value', () => {
      const submitField = jest.fn(() => ({ valid: true }));
      useFormMode.mockReturnValue(
        makeFormMode({ getCurrentField: jest.fn(() => textField), submitField })
      );
      render(<FormFieldPrompt onCancel={jest.fn()} />);

      const submitButton = screen.getByRole('button', { name: 'Submit' });
      expect(submitButton).toBeDisabled();

      const input = screen.getByLabelText((c, el) => el?.id === 'field-first_name');
      fireEvent.change(input, { target: { value: '  Jamie  ' } });
      expect(submitButton).not.toBeDisabled();

      fireEvent.click(submitButton);
      expect(submitField).toHaveBeenCalledWith('first_name', 'Jamie');
    });

    test('validation error renders as an accessible alert linked via aria-describedby', () => {
      useFormMode.mockReturnValue(
        makeFormMode({
          getCurrentField: jest.fn(() => textField),
          validationErrors: { first_name: 'This field is required' },
        })
      );
      render(<FormFieldPrompt onCancel={jest.fn()} />);

      const input = screen.getByLabelText((c, el) => el?.id === 'field-first_name');
      expect(input).toHaveAttribute('aria-describedby', 'error-first_name');

      const alert = screen.getByRole('alert');
      expect(alert).toHaveAttribute('aria-live', 'polite');
      expect(alert).toHaveClass('hairline-form-error');
      expect(alert).toHaveTextContent('This field is required');
    });

    test('cancel button calls cancelForm and onCancel', () => {
      const cancelForm = jest.fn();
      const onCancel = jest.fn();
      useFormMode.mockReturnValue(makeFormMode({ getCurrentField: jest.fn(() => textField), cancelForm }));
      render(<FormFieldPrompt onCancel={onCancel} />);

      fireEvent.click(screen.getByRole('button', { name: 'Cancel Form' }));
      expect(cancelForm).toHaveBeenCalledTimes(1);
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe.each([
    ['email', 'email'],
    ['phone', 'tel'],
    ['number', 'number'],
    ['date', 'date'],
  ])('%s field', (fieldType, expectedInputType) => {
    const field = { id: 'f1', type: fieldType, prompt: `Enter your ${fieldType}` };

    beforeEach(() => {
      useChat.mockReturnValue(baseChat());
      useConfig.mockReturnValue(baseConfig());
    });

    test(`renders a hairline-form-input with type="${expectedInputType}" and a working submit`, () => {
      const submitField = jest.fn(() => ({ valid: true }));
      useFormMode.mockReturnValue(makeFormMode({ getCurrentField: jest.fn(() => field), submitField }));
      render(<FormFieldPrompt onCancel={jest.fn()} />);

      const input = document.getElementById('field-f1');
      expect(input).toHaveClass('hairline-form-input');
      expect(input).toHaveAttribute('type', expectedInputType);

      if (fieldType !== 'date') {
        fireEvent.change(input, { target: { value: '5' } });
      } else {
        fireEvent.change(input, { target: { value: '2026-01-01' } });
      }
      fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
      expect(submitField).toHaveBeenCalledWith('f1', fieldType === 'date' ? '2026-01-01' : '5');
    });
  });

  describe('textarea field', () => {
    const textareaField = { id: 'notes', type: 'textarea', prompt: 'Anything else to share?' };

    test('renders a hairline-form-textarea and submits its value', () => {
      const submitField = jest.fn(() => ({ valid: true }));
      useFormMode.mockReturnValue(makeFormMode({ getCurrentField: jest.fn(() => textareaField), submitField }));
      useChat.mockReturnValue(baseChat());
      useConfig.mockReturnValue(baseConfig());

      render(<FormFieldPrompt onCancel={jest.fn()} />);
      const textarea = document.getElementById('field-notes');
      expect(textarea.tagName).toBe('TEXTAREA');
      expect(textarea).toHaveClass('hairline-form-textarea');

      fireEvent.change(textarea, { target: { value: 'Looking forward to it!' } });
      fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
      expect(submitField).toHaveBeenCalledWith('notes', 'Looking forward to it!');
    });
  });

  describe('select field — rendered as Hairline menu rows', () => {
    const selectField = {
      id: 'program',
      type: 'select',
      prompt: 'Which program interests you?',
      options: [
        { value: 'mentoring', label: 'Mentoring' },
        { value: 'sponsorship', label: 'Sponsorship' },
      ],
    };

    beforeEach(() => {
      useChat.mockReturnValue(baseChat());
      useConfig.mockReturnValue(baseConfig());
    });

    test('renders one menu row per option inside a hairline-form-menu group', () => {
      useFormMode.mockReturnValue(makeFormMode({ getCurrentField: jest.fn(() => selectField) }));
      render(<FormFieldPrompt onCancel={jest.fn()} />);

      const group = screen.getByRole('group', { name: 'Which program interests you?' });
      expect(group).toHaveClass('hairline-form-menu');
      const rows = screen.getAllByRole('button', { name: /Mentoring|Sponsorship/ });
      expect(rows).toHaveLength(2);
      rows.forEach((row) => expect(row).toHaveClass('hairline-form-menu-row'));
    });

    test('clicking an option dispatches submitField with the option value (frozen dispatch contract)', () => {
      const submitField = jest.fn(() => ({}));
      useFormMode.mockReturnValue(makeFormMode({ getCurrentField: jest.fn(() => selectField), submitField }));
      render(<FormFieldPrompt onCancel={jest.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: 'Sponsorship' }));
      expect(submitField).toHaveBeenCalledWith('program', 'sponsorship');
    });

    test('eligibility failure shows the Hairline overlay with the failure message', () => {
      const cancelForm = jest.fn();
      const addMessage = jest.fn();
      const submitField = jest.fn(() => ({
        eligibilityFailed: true,
        failureMessage: 'You must be 22 or older to apply.',
      }));
      useFormMode.mockReturnValue(
        makeFormMode({ getCurrentField: jest.fn(() => selectField), submitField, cancelForm })
      );
      useChat.mockReturnValue({ addMessage, sendMessage: jest.fn() });

      render(<FormFieldPrompt onCancel={jest.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: 'Mentoring' }));

      expect(addMessage).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'You must be 22 or older to apply.' })
      );
      const overlay = document.querySelector('.hairline-form-eligibility-overlay');
      expect(overlay).toBeInTheDocument();
      expect(overlay).toHaveTextContent('You must be 22 or older to apply.');
      // Eligibility failure keeps the form open (overlay auto-fades in the
      // component's own timeout) — cancelForm is NOT part of this path.
      expect(cancelForm).not.toHaveBeenCalled();
    });

    test('"send to Bedrock" result cancels the form and forwards the query (frozen dispatch)', () => {
      const cancelForm = jest.fn();
      const sendMessage = jest.fn();
      const submitField = jest.fn(() => ({ sendToBedrockQuery: 'Tell me about both programs' }));
      useFormMode.mockReturnValue(
        makeFormMode({ getCurrentField: jest.fn(() => selectField), submitField, cancelForm })
      );
      useChat.mockReturnValue({ addMessage: jest.fn(), sendMessage });

      render(<FormFieldPrompt onCancel={jest.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: 'Mentoring' }));

      expect(cancelForm).toHaveBeenCalledTimes(1);
      expect(sendMessage).toHaveBeenCalledWith('Tell me about both programs');
    });

    test('"prompt user" result cancels the form and adds a waiting-for-response assistant message', () => {
      const cancelForm = jest.fn();
      const addMessage = jest.fn();
      const submitField = jest.fn(() => ({ promptUser: 'How can I help you decide?' }));
      useFormMode.mockReturnValue(
        makeFormMode({ getCurrentField: jest.fn(() => selectField), submitField, cancelForm })
      );
      useChat.mockReturnValue({ addMessage, sendMessage: jest.fn() });

      render(<FormFieldPrompt onCancel={jest.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: 'Mentoring' }));

      expect(cancelForm).toHaveBeenCalledTimes(1);
      expect(addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'assistant',
          content: 'How can I help you decide?',
          metadata: expect.objectContaining({ waitingForResponse: true }),
        })
      );
    });

    test('"pivot to form" result cancels the current form and starts the target form config', () => {
      const cancelForm = jest.fn();
      const startFormWithConfig = jest.fn();
      const addMessage = jest.fn();
      const submitField = jest.fn(() => ({ pivotToForm: 'mentoring_form', programInterest: 'mentoring' }));
      useFormMode.mockReturnValue(
        makeFormMode({ getCurrentField: jest.fn(() => selectField), submitField, cancelForm, startFormWithConfig })
      );
      useChat.mockReturnValue({ addMessage, sendMessage: jest.fn() });
      useConfig.mockReturnValue({
        config: { conversational_forms: { mentoring_form: { form_id: 'mentoring_form', fields: [] } } },
      });

      render(<FormFieldPrompt onCancel={jest.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: 'Mentoring' }));

      expect(cancelForm).toHaveBeenCalledTimes(1);
      expect(startFormWithConfig).toHaveBeenCalledWith(
        'mentoring_form',
        expect.objectContaining({ form_id: 'mentoring_form' })
      );
      expect(addMessage).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: expect.objectContaining({ isFormTransition: true }) })
      );
    });
  });

  describe('suspended state', () => {
    test('renders the quiet Hairline suspended overlay and modifier class', () => {
      const textField = { id: 'email', type: 'email', prompt: 'Email address?' };
      useFormMode.mockReturnValue(
        makeFormMode({ getCurrentField: jest.fn(() => textField), isSuspended: true })
      );
      useChat.mockReturnValue(baseChat());
      useConfig.mockReturnValue(baseConfig());

      render(<FormFieldPrompt onCancel={jest.fn()} />);

      const card = document.querySelector('.hairline-form');
      expect(card).toHaveClass('hairline-form--suspended');
      expect(screen.getByText('Form paused - answer your question above')).toBeInTheDocument();
    });
  });

  describe('header, subtitle, intro, and field hints', () => {
    beforeEach(() => {
      useChat.mockReturnValue(baseChat());
      useConfig.mockReturnValue(baseConfig());
    });

    test('renders the form subtitle and first-step introduction with Hairline classes', () => {
      const field = { id: 'first_name', type: 'text', prompt: 'First name?' };
      useFormMode.mockReturnValue(
        makeFormMode({
          getCurrentField: jest.fn(() => field),
          formConfig: {
            form_title: 'Volunteer application',
            form_subtitle: 'Takes about 3 minutes',
            introduction: "Thanks for your interest! Let's get started.",
            fields: [field],
          },
          getFormProgress: jest.fn(() => ({ currentStep: 1, totalSteps: 1, percentComplete: 100 })),
        })
      );
      render(<FormFieldPrompt onCancel={jest.fn()} />);

      expect(screen.getByText('Takes about 3 minutes')).toHaveClass('hairline-form-subtitle');
      expect(screen.getByText("Thanks for your interest! Let's get started.")).toHaveClass('hairline-form-intro');
    });

    test('introduction is hidden after the first step', () => {
      const field = { id: 'last_name', type: 'text', prompt: 'Last name?' };
      useFormMode.mockReturnValue(
        makeFormMode({
          getCurrentField: jest.fn(() => field),
          formConfig: { introduction: 'Intro copy', fields: [{}, field] },
          getFormProgress: jest.fn(() => ({ currentStep: 2, totalSteps: 2, percentComplete: 100 })),
        })
      );
      render(<FormFieldPrompt onCancel={jest.fn()} />);
      expect(screen.queryByText('Intro copy')).not.toBeInTheDocument();
    });

    test.each([
      ['email', 'Please enter a valid email address'],
      ['phone', 'Please enter your phone number (10 digits)'],
      ['date', 'Select a date using the calendar picker'],
    ])('%s field shows its Hairline hint text', (fieldType, hintText) => {
      const field = { id: 'f1', type: fieldType, prompt: `Enter your ${fieldType}` };
      useFormMode.mockReturnValue(makeFormMode({ getCurrentField: jest.fn(() => field) }));
      render(<FormFieldPrompt onCancel={jest.fn()} />);
      expect(screen.getByText(hintText)).toHaveClass('hairline-form-hint');
    });
  });

  describe('composite field mount (name/address/phone_with_consent)', () => {
    test('mounts CompositeFieldGroup and routes its submit through handleCompositeSubmit → submitField', () => {
      const submitField = jest.fn(() => ({}));
      const nameField = {
        id: 'full_name',
        type: 'name',
        prompt: "What's your name?",
        subfields: [{ id: 'full_name.first_name', label: 'First name', required: true }],
      };
      useFormMode.mockReturnValue(makeFormMode({ getCurrentField: jest.fn(() => nameField), submitField }));
      useChat.mockReturnValue(baseChat());
      useConfig.mockReturnValue(baseConfig());

      render(<FormFieldPrompt onCancel={jest.fn()} />);
      expect(document.querySelector('.hairline-composite-group')).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText(/First name/), { target: { value: 'Jamie' } });
      fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

      expect(submitField).toHaveBeenCalledWith('full_name', { 'full_name.first_name': 'Jamie' });
    });

    test('composite eligibility failure adds a chat message (frozen: handleCompositeSubmit does not raise the visual overlay — that is select-field-only)', () => {
      const addMessage = jest.fn();
      const submitField = jest.fn(() => ({ eligibilityFailed: true, failureMessage: 'Must be 18+' }));
      const nameField = {
        id: 'full_name',
        type: 'name',
        prompt: "What's your name?",
        subfields: [{ id: 'full_name.first_name', label: 'First name', required: true }],
      };
      useFormMode.mockReturnValue(makeFormMode({ getCurrentField: jest.fn(() => nameField), submitField }));
      useChat.mockReturnValue({ addMessage, sendMessage: jest.fn() });
      useConfig.mockReturnValue(baseConfig());

      render(<FormFieldPrompt onCancel={jest.fn()} />);
      fireEvent.change(screen.getByLabelText(/First name/), { target: { value: 'Jamie' } });
      fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

      expect(addMessage).toHaveBeenCalledWith(expect.objectContaining({ content: 'Must be 18+' }));
      expect(document.querySelector('.hairline-form-eligibility-overlay')).not.toBeInTheDocument();
    });
  });
});
