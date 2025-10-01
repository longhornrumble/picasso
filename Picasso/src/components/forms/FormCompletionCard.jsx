import React from 'react';

/**
 * FormCompletionCard Component
 * Displays confirmation message and next steps after form submission
 */
export default function FormCompletionCard({
  formId,
  formData,
  formFields,
  config,
  onEndSession,
  onContinue
}) {
  // Use default config if none provided
  const defaultConfig = {
    confirmation_message: "Thank you for submitting your information! We've received your response and will be in touch soon.",
    next_steps: [
      "We'll review your information",
      "Someone from our team will reach out to you",
      "Check your email for updates"
    ],
    actions: [
      {
        id: "continue",
        label: "Continue Chat",
        action: "continue"
      },
      {
        id: "end_session",
        label: "End Session",
        action: "end_session"
      }
    ]
  };

  const activeConfig = config || defaultConfig;
  const { confirmation_message, next_steps, actions } = activeConfig;

  // Replace placeholders in confirmation message
  const replacePlaceholders = (text) => {
    if (!text || !formData) return text;

    let result = text;
    Object.entries(formData).forEach(([fieldId, value]) => {
      const placeholder = `{${fieldId}}`;
      result = result.replace(new RegExp(placeholder, 'g'), value);
    });
    return result;
  };

  const displayMessage = replacePlaceholders(confirmation_message);

  return (
    <div className="form-completion-card">
      {/* Success header */}
      <div className="form-completion-header">
        <svg
          className="form-completion-icon"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <h3 className="form-completion-title">Form Submitted</h3>
      </div>

      {/* Confirmation message */}
      {displayMessage && (
        <div className="form-completion-message">
          {displayMessage}
        </div>
      )}

      {/* Summary of submitted data */}
      {formData && Object.keys(formData).length > 0 && (
        <div className="form-completion-summary">
          <div className="form-completion-summary-title">Your Information:</div>
          {Object.entries(formData).map(([fieldId, value]) => {
            // Find the field definition to get the proper label
            const fieldDef = formFields?.find(f => f.id === fieldId);
            const label = fieldDef?.label || fieldId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

            // For select fields, try to get the option label instead of value
            let displayValue = value;
            if (fieldDef?.type === 'select' && fieldDef?.options) {
              const option = fieldDef.options.find(opt => opt.value === value);
              displayValue = option?.label || value;
            }

            return (
              <div key={fieldId} className="form-completion-field">
                <span className="form-completion-field-label">
                  {label}:
                </span>
                <span className="form-completion-field-value">{displayValue}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Next steps */}
      {next_steps && next_steps.length > 0 && (
        <div className="form-completion-next-steps">
          <div className="form-completion-next-steps-title">What happens next:</div>
          <ul className="form-completion-next-steps-list">
            {next_steps.map((step, index) => (
              <li key={index} className="form-completion-next-step">
                {replacePlaceholders(step)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action buttons */}
      {actions && actions.length > 0 && (
        <div className="form-completion-actions">
          {actions.map((action, index) => (
            <button
              key={index}
              className={`form-completion-action-button ${action.id === 'end_session' ? 'secondary' : 'primary'}`}
              onClick={() => {
                // Handle end session
                if (action.action === 'end_session' || action.action === 'end_conversation' || action.id === 'end_session') {
                  if (onEndSession) {
                    onEndSession();
                  }
                }
                // Handle continue chat
                else if (action.action === 'continue' || action.action === 'continue_conversation' || action.id === 'continue') {
                  if (onContinue) {
                    onContinue();
                  }
                }
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}