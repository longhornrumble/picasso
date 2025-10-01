import React, { useState, useRef, useEffect } from 'react';
import { useFormMode } from '../../context/FormModeContext';
import { useChat } from '../../hooks/useChat';
import { useConfig } from '../../hooks/useConfig';

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

      // Show the message in the form UI first
      setEligibilityMessage(result.failureMessage);
      setIsFadingOut(false);

      // Start fade out after 2 seconds
      setTimeout(() => {
        setIsFadingOut(true);
      }, 2000);

      // Then add to chat after fade completes
      setTimeout(() => {
        addMessage({
          role: 'assistant',
          content: result.failureMessage,
          metadata: {
            isEligibilityFailure: true
          }
        });
      }, 2500); // Give user time to read the message in the form
    }
  };

  // Get validation error for current field
  const error = validationErrors[currentField.id];

  return (
    <div className={`form-field-prompt ${isSuspended ? 'form-suspended' : ''}`}>
      {/* Eligibility failure overlay */}
      {eligibilityMessage && (
        <div className={`eligibility-overlay ${isFadingOut ? 'fade-out' : ''}`}>
          <div className="eligibility-card">
            <div className="eligibility-icon">🚫</div>
            <div className="eligibility-title">Eligibility Requirement Not Met</div>
            <div className="eligibility-message">{eligibilityMessage}</div>
          </div>
        </div>
      )}

      {/* Suspended overlay */}
      {isSuspended && !eligibilityMessage && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
          borderRadius: '12px'
        }}>
          <div style={{
            background: '#fff',
            padding: '16px 24px',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            textAlign: 'center',
            fontSize: '15px',
            fontWeight: 500,
            color: '#333'
          }}>
            ⏸️ Form paused - answer your question above
          </div>
        </div>
      )}

      {/* Form Header with Title and Subtitle */}
      {(formConfig?.form_title || formConfig?.title) && (
        <div className="form-header">
          <div className="form-header-title">
            {formConfig.form_title || formConfig.title}
          </div>
          {formConfig.form_subtitle && (
            <div className="form-header-subtitle">
              {formConfig.form_subtitle}
            </div>
          )}
        </div>
      )}

      {/* Progress indicator */}
      <div className="form-progress">
        <div className="form-progress-bar">
          <div
            className="form-progress-fill"
            style={{ width: `${progress.percentComplete}%` }}
          />
        </div>
        <div className="form-progress-text">
          Step {progress.currentStep} of {progress.totalSteps}
        </div>
      </div>

      {/* Field prompt */}
      <div className="form-field-content">
        <div className="form-field-label">
          {currentField.prompt || currentField.label}
        </div>

        {/* Field-specific hints */}
        {currentField.type === 'email' && (
          <div className="form-field-hint">
            Please enter a valid email address
          </div>
        )}

        {currentField.type === 'phone' && (
          <div className="form-field-hint">
            Please enter your phone number (10 digits)
          </div>
        )}

        {/* Input fields based on type */}
        <div className="form-field-input-container">
          {/* Text input */}
          {currentField.type === 'text' && (
            <form onSubmit={handleSubmit}>
              <input
                ref={inputRef}
                type="text"
                className="form-field-input"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={currentField.placeholder || 'Type your answer...'}
                required={currentField.required}
              />
            </form>
          )}

          {/* Email input */}
          {currentField.type === 'email' && (
            <form onSubmit={handleSubmit}>
              <input
                ref={inputRef}
                type="email"
                className="form-field-input"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={currentField.placeholder || 'your.email@example.com'}
                required={currentField.required}
              />
            </form>
          )}

          {/* Phone input */}
          {currentField.type === 'phone' && (
            <form onSubmit={handleSubmit}>
              <input
                ref={inputRef}
                type="tel"
                className="form-field-input"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={currentField.placeholder || '(555) 123-4567'}
                required={currentField.required}
              />
            </form>
          )}

          {/* Textarea for long text */}
          {currentField.type === 'textarea' && (
            <form onSubmit={handleSubmit}>
              <textarea
                ref={inputRef}
                className="form-field-textarea"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={currentField.placeholder || 'Type your answer...'}
                rows={4}
                required={currentField.required}
              />
            </form>
          )}

          {/* Select/radio options */}
          {currentField.type === 'select' && currentField.options && (
            <div className="form-select-options">
              {currentField.options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="form-select-option"
                  onClick={() => handleSelectOption(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          {/* Submit button for text inputs */}
          {['text', 'email', 'phone', 'textarea'].includes(currentField.type) && (
            <button
              type="button"
              className="form-submit-button"
              onClick={handleSubmit}
              disabled={!inputValue.trim()}
            >
              Submit
            </button>
          )}
        </div>

        {/* Validation error */}
        {error && (
          <div className="form-field-error">
            {error}
          </div>
        )}

        {/* Required field indicator */}
        {currentField.required && (
          <div className="form-field-required">
            * Required field
          </div>
        )}
      </div>

      {/* Cancel button */}
      <div className="form-field-actions">
        <button
          className="form-cancel-button"
          onClick={handleCancel}
          type="button"
        >
          Cancel Form
        </button>
      </div>
    </div>
  );
}