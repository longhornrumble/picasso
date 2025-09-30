import React, { useState, useRef, useEffect } from 'react';
import { useFormMode } from '../../context/FormModeContext';

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
    submitField
  } = useFormMode();

  const [inputValue, setInputValue] = useState('');
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
      submitField(currentField.id, inputValue.trim());
    }
  };

  const handleSelectOption = (value) => {
    submitField(currentField.id, value);
  };

  // Get validation error for current field
  const error = validationErrors[currentField.id];

  return (
    <div className="form-field-prompt">
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