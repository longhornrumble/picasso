// src/components/forms/FormFieldPrompt.jsx
//
// Hairline redesign (W4.1): conversational forms suite — an UNMOCKED
// surface (no Turn 10 mock; HAIRLINE_REDESIGN_MAPPING.md §0 case 2 / §4
// item 1). The appearance below is a fresh Hairline treatment extrapolated
// from the mocked surfaces' vocabulary (form card = hairline card,
// select-buttons = menu rows, progress = accent hairline) — NOT a restyle
// of the old `.form-field-prompt`/`.form-select-option`/etc. look. Styles
// live in src/styles/hairline-forms.css.
//
// FROZEN (do not change): field validation rules, the submission dispatch
// (`submitField`/`handleSelectOption` result handling — eligibility
// failure, form pivot, Bedrock query handoff), and the suspend/resume
// state machine. See docs/HAIRLINE_WORKPLAN.md W4.1.
import React, { useState, useRef, useEffect } from 'react';
import { AlertCircle, Pause, ChevronRight } from 'lucide-react';
import { useFormMode } from '../../context/FormModeContext';
import { useChat } from '../../hooks/useChat';
import { useConfig } from '../../hooks/useConfig';
import CompositeFieldGroup from './CompositeFieldGroup';

/**
 * FormFieldPrompt Component
 * Displays the current form field prompt and handles user interaction
 */
export default function FormFieldPrompt({ onCancel }) {
  const {
    formConfig,
    getCurrentField,
    getFormProgress,
    validationErrors,
    cancelForm,
    submitField,
    startFormWithConfig,
    isSuspended // NEW: Get suspended state
  } = useFormMode();

  const { addMessage, sendMessage } = useChat();
  const { config } = useConfig();

  const [inputValue, setInputValue] = useState('');
  const [eligibilityMessage, setEligibilityMessage] = useState(null);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const inputRef = useRef(null);

  const currentField = getCurrentField();
  const progress = getFormProgress();

  // Focus input when field changes
  useEffect(() => {
    setInputValue('');
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [currentField?.id]);

  if (!currentField) {
    return null;
  }

  const handleCancel = () => {
    cancelForm();
    if (onCancel) {
      onCancel();
    }
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (inputValue.trim()) {
      const result = submitField(currentField.id, inputValue.trim());

      // Handle eligibility failure
      if (result?.eligibilityFailed) {
        addMessage({
          role: 'assistant',
          content: result.failureMessage,
          metadata: {
            isEligibilityFailure: true
          }
        });
      }

      // Clear input on success
      if (result?.valid) {
        setInputValue('');
      }
    }
  };

  const handleCompositeSubmit = (values) => {
    // Submit composite field with all subfield values
    const result = submitField(currentField.id, values);

    // Handle eligibility failure
    if (result?.eligibilityFailed) {
      addMessage({
        role: 'assistant',
        content: result.failureMessage,
        metadata: {
          isEligibilityFailure: true
        }
      });
    }
  };

  const handleSelectOption = (value) => {
    console.log('[FormFieldPrompt] Select option clicked:', {
      fieldId: currentField.id,
      value: value,
      hasEligibilityGate: !!currentField.eligibility_gate,
      eligibilityGate: currentField.eligibility_gate,
      failureMessage: currentField.failure_message
    });

    const result = submitField(currentField.id, value);
    console.log('[FormFieldPrompt] submitField result:', result);

    // Handle "Tell me more about both" - send query to Bedrock
    if (result?.sendToBedrockQuery) {
      console.log('[FormFieldPrompt] Sending query to Bedrock:', result.sendToBedrockQuery);

      // Cancel the form
      cancelForm();

      // Send the query to Bedrock
      sendMessage(result.sendToBedrockQuery);

      return; // Exit early
    }

    // Handle "I'm not sure yet" - prompt user for clarification
    if (result?.promptUser) {
      console.log('[FormFieldPrompt] Prompting user:', result.promptUser);

      // Cancel the form
      cancelForm();

      // Add assistant message asking how to help
      addMessage({
        role: 'assistant',
        content: result.promptUser,
        metadata: {
          isPrompt: true,
          waitingForResponse: true
        }
      });

      return; // Exit early, wait for user's next message which will go to Bedrock
    }

    // Handle form pivot (volunteer form to specific program form)
    if (result?.pivotToForm) {
      console.log('[FormFieldPrompt] Pivoting to form:', result.pivotToForm);

      // Get the target form config
      const targetFormConfig = config?.conversational_forms?.[result.pivotToForm];

      if (targetFormConfig) {
        // Cancel current volunteer form
        cancelForm();

        // Start the new specific form with its config
        const formId = targetFormConfig.form_id || result.pivotToForm;
        startFormWithConfig(formId, targetFormConfig);

        // Add a transition message to the chat
        addMessage({
          role: 'assistant',
          content: `Great! Let's continue with your ${result.programInterest} application.`,
          metadata: {
            isFormTransition: true
          }
        });
      } else {
        console.error('[FormFieldPrompt] Target form config not found:', result.pivotToForm);
      }

      return; // Exit early, don't process further
    }

    // Handle eligibility failure
    if (result?.eligibilityFailed) {
      console.log('[FormFieldPrompt] Eligibility failed! Showing message:', result.failureMessage);

      // Add message to chat immediately so user can respond after form closes
      addMessage({
        role: 'assistant',
        content: result.failureMessage,
        metadata: {
          isEligibilityFailure: true
        }
      });

      // Also show visual overlay for immediate feedback
      setEligibilityMessage(result.failureMessage);
      setIsFadingOut(false);

      // Start fade out after 2 seconds
      setTimeout(() => {
        setIsFadingOut(true);
      }, 2000);

      // Note: Form will exit automatically after 2.5 seconds (handled in FormModeContext)
      // The message is already in chat history, so user can respond naturally
    }
  };

  // Get validation error for current field
  const error = validationErrors[currentField.id];

  return (
    <div className={`hairline-form${isSuspended ? ' hairline-form--suspended' : ''}`}>
      {/* Eligibility failure overlay */}
      {eligibilityMessage && (
        <div className={`hairline-form-eligibility-overlay${isFadingOut ? ' is-fading-out' : ''}`}>
          <div className="hairline-form-eligibility-card">
            <AlertCircle className="hairline-form-eligibility-icon" size={22} strokeWidth={2} aria-hidden="true" />
            <div className="hairline-form-eligibility-title">Eligibility Requirement Not Met</div>
            <div className="hairline-form-eligibility-message">{eligibilityMessage}</div>
          </div>
        </div>
      )}

      {/* Suspended overlay */}
      {isSuspended && !eligibilityMessage && (
        <div className="hairline-form-suspended-overlay">
          <div className="hairline-form-suspended-message">
            <Pause size={15} strokeWidth={2} aria-hidden="true" />
            <span>Form paused - answer your question above</span>
          </div>
        </div>
      )}

      {/* Form Header with Title and Subtitle */}
      {(formConfig?.form_title || formConfig?.title) && (
        <div className="hairline-form-header">
          <div className="hairline-form-title">
            {formConfig.form_title || formConfig.title}
          </div>
          {formConfig.form_subtitle && (
            <div className="hairline-form-subtitle">
              {formConfig.form_subtitle}
            </div>
          )}
        </div>
      )}

      {/* Form Introduction - show only on first field */}
      {formConfig?.introduction && progress?.currentStep === 1 && (
        <div className="hairline-form-intro">
          {formConfig.introduction}
        </div>
      )}

      {/* Progress indicator */}
      <div className="hairline-form-progress">
        <div className="hairline-form-progress-track">
          <div
            className="hairline-form-progress-fill"
            style={{ width: `${progress.percentComplete}%` }}
          />
        </div>
        <div className="hairline-form-progress-text">
          Step {progress.currentStep} of {progress.totalSteps}
        </div>
      </div>

      {/* Field prompt */}
      <div className="hairline-form-field">
        <label
          id={`label-${currentField.id}`}
          htmlFor={!['select', 'name', 'address', 'phone_with_consent'].includes(currentField.type) ? `field-${currentField.id}` : undefined}
          className="hairline-form-label"
        >
          {currentField.prompt || currentField.label}
          {currentField.required && (
            <span className="hairline-form-required-mark" aria-hidden="true">*</span>
          )}
        </label>

        {/* Field-specific hints */}
        {currentField.type === 'email' && (
          <div className="hairline-form-hint">
            Please enter a valid email address
          </div>
        )}

        {currentField.type === 'phone' && (
          <div className="hairline-form-hint">
            Please enter your phone number (10 digits)
          </div>
        )}

        {currentField.type === 'date' && (
          <div className="hairline-form-hint">
            Select a date using the calendar picker
          </div>
        )}

        {/* Input fields based on type */}
        <div className="hairline-form-input-group">
          {/* Text input */}
          {currentField.type === 'text' && (
            <form onSubmit={handleSubmit}>
              <input
                ref={inputRef}
                id={`field-${currentField.id}`}
                name={currentField.id}
                type="text"
                className="hairline-form-input"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={currentField.placeholder || 'Type your answer...'}
                required={currentField.required}
                aria-describedby={error ? `error-${currentField.id}` : undefined}
              />
            </form>
          )}

          {/* Email input */}
          {currentField.type === 'email' && (
            <form onSubmit={handleSubmit}>
              <input
                ref={inputRef}
                id={`field-${currentField.id}`}
                name={currentField.id}
                type="email"
                className="hairline-form-input"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={currentField.placeholder || 'your.email@example.com'}
                required={currentField.required}
                aria-describedby={error ? `error-${currentField.id}` : undefined}
              />
            </form>
          )}

          {/* Phone input */}
          {currentField.type === 'phone' && (
            <form onSubmit={handleSubmit}>
              <input
                ref={inputRef}
                id={`field-${currentField.id}`}
                name={currentField.id}
                type="tel"
                className="hairline-form-input"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={currentField.placeholder || '(555) 123-4567'}
                required={currentField.required}
                aria-describedby={error ? `error-${currentField.id}` : undefined}
              />
            </form>
          )}

          {/* Number input */}
          {currentField.type === 'number' && (
            <form onSubmit={handleSubmit}>
              <input
                ref={inputRef}
                id={`field-${currentField.id}`}
                name={currentField.id}
                type="number"
                className="hairline-form-input"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={currentField.placeholder || 'Enter a number...'}
                required={currentField.required}
                aria-describedby={error ? `error-${currentField.id}` : undefined}
              />
            </form>
          )}

          {/* Date input */}
          {currentField.type === 'date' && (
            <form onSubmit={handleSubmit}>
              <input
                ref={inputRef}
                id={`field-${currentField.id}`}
                name={currentField.id}
                type="date"
                className="hairline-form-input"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                required={currentField.required}
                aria-describedby={error ? `error-${currentField.id}` : undefined}
              />
            </form>
          )}

          {/* Textarea for long text */}
          {currentField.type === 'textarea' && (
            <form onSubmit={handleSubmit}>
              <textarea
                ref={inputRef}
                id={`field-${currentField.id}`}
                name={currentField.id}
                className="hairline-form-textarea"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={currentField.placeholder || 'Type your answer...'}
                rows={4}
                required={currentField.required}
                aria-describedby={error ? `error-${currentField.id}` : undefined}
              />
            </form>
          )}

          {/* Select/radio options — rendered as Hairline menu rows */}
          {currentField.type === 'select' && currentField.options && (
            <div
              className="hairline-form-menu"
              role="group"
              aria-labelledby={`label-${currentField.id}`}
            >
              {currentField.options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="hairline-form-menu-row"
                  onClick={() => handleSelectOption(option.value)}
                >
                  <span>{option.label}</span>
                  <ChevronRight className="hairline-form-menu-row-arrow" size={13} strokeWidth={2} aria-hidden="true" />
                </button>
              ))}
            </div>
          )}

          {/* Composite fields (name, address, phone_with_consent) */}
          {(currentField.type === 'name' || currentField.type === 'address' || currentField.type === 'phone_with_consent') && currentField.subfields && (
            <CompositeFieldGroup
              field={currentField}
              onSubmit={handleCompositeSubmit}
              inputRef={inputRef}
              labelId={`label-${currentField.id}`}
            />
          )}

          {/* Submit button for text inputs */}
          {['text', 'email', 'phone', 'number', 'date', 'textarea'].includes(currentField.type) && (
            <button
              type="button"
              className="hairline-form-submit"
              onClick={handleSubmit}
              disabled={!inputValue.trim()}
            >
              Submit
            </button>
          )}
        </div>

        {/* Validation error */}
        {error && (
          <div
            id={`error-${currentField.id}`}
            className="hairline-form-error"
            role="alert"
            aria-live="polite"
          >
            {error}
          </div>
        )}
      </div>

      {/* Cancel button — sentence case per DESIGN_SPEC.md's casing rule
          (W6.3 audit fix F7) */}
      <div className="hairline-form-actions">
        <button
          className="hairline-form-cancel"
          onClick={handleCancel}
          type="button"
        >
          Cancel form
        </button>
      </div>
    </div>
  );
}