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
  onContinue,
  onStartForm
}) {
  // DEBUG: Log everything we receive
  console.log('[FormCompletionCard] Rendering with props:', {
    formId,
    config,
    configType: typeof config,
    configIsNull: config === null,
    configIsUndefined: config === undefined,
    configKeys: config ? Object.keys(config) : 'N/A',
    hasConfirmationMessage: !!config?.confirmation_message,
    hasNextSteps: !!config?.next_steps,
    nextStepsLength: config?.next_steps?.length,
    nextStepsValue: config?.next_steps,
    hasActions: !!config?.actions,
    fullConfig: JSON.stringify(config, null, 2)
  });

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

  // Merge provided config with defaults - use defaults for missing properties
  // Support both formats: config.post_submission.next_steps (new) and config.next_steps (legacy)
  const activeConfig = {
    confirmation_message: config?.post_submission?.confirmation_message || config?.confirmation_message || defaultConfig.confirmation_message,
    next_steps: config?.post_submission?.next_steps || config?.next_steps || defaultConfig.next_steps,
    actions: config?.post_submission?.actions || config?.actions || defaultConfig.actions
  };

  console.log('[FormCompletionCard] 🔍 FALLBACK ANALYSIS:', {
    hasConfigProp: !!config,
    configNextStepsExists: config?.next_steps !== undefined,
    configNextStepsValue: config?.next_steps,
    configNextStepsIsArray: Array.isArray(config?.next_steps),
    configNextStepsLength: config?.next_steps?.length,
    willUseDefaults: !config?.next_steps,
    defaultNextStepsLength: defaultConfig.next_steps.length
  });

  console.log('[FormCompletionCard] Active config after merge:', {
    confirmationMessage: activeConfig.confirmation_message,
    nextStepsCount: activeConfig.next_steps?.length,
    nextSteps: activeConfig.next_steps,
    actionsCount: activeConfig.actions?.length,
    usingDefaultNextSteps: activeConfig.next_steps === defaultConfig.next_steps
  });

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

            // Handle composite fields (name, address, phone_and_email) - render as nested object
            let displayValue = value;

            if (fieldDef?.type === 'name' && typeof value === 'object') {
              // Render name as "First Middle Last"
              const parts = [
                value[`${fieldId}.first_name`],
                value[`${fieldId}.middle_name`],
                value[`${fieldId}.last_name`]
              ].filter(Boolean);
              displayValue = parts.join(' ');
            } else if (fieldDef?.type === 'address' && typeof value === 'object') {
              // Render address as multi-line
              const street = value[`${fieldId}.street`];
              const aptUnit = value[`${fieldId}.apt_unit`];
              const city = value[`${fieldId}.city`];
              const state = value[`${fieldId}.state`];
              const zipCode = value[`${fieldId}.zip_code`];

              const lines = [
                aptUnit ? `${street}, ${aptUnit}` : street,
                `${city}, ${state} ${zipCode}`
              ].filter(Boolean);

              displayValue = lines.join('\n');
            } else if (fieldDef?.type === 'phone_and_email' && typeof value === 'object') {
              // Render phone and email on separate lines
              const phone = value[`${fieldId}.phone`];
              const email = value[`${fieldId}.email`];
              displayValue = [phone, email].filter(Boolean).join('\n');
            } else if (fieldDef?.type === 'select' && fieldDef?.options) {
              // For select fields, try to get the option label instead of value
              const option = fieldDef.options.find(opt => opt.value === value);
              displayValue = option?.label || value;
            }

            return (
              <div key={fieldId} className="form-completion-field">
                <span className="form-completion-field-label">
                  {label}:
                </span>
                <span className="form-completion-field-value" style={{ whiteSpace: 'pre-line' }}>
                  {displayValue}
                </span>
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
              className={`form-completion-action-button ${action.action === 'end_conversation' || action.id === 'end_session' ? 'secondary' : 'primary'}`}
              onClick={() => {
                // Handle end conversation
                if (action.action === 'end_session' || action.action === 'end_conversation' || action.id === 'end_session') {
                  if (onEndSession) {
                    onEndSession();
                  }
                }
                // Handle continue conversation with optional prompt
                else if (action.action === 'continue' || action.action === 'continue_conversation' || action.id === 'continue') {
                  if (onContinue) {
                    // Use configured prompt or default
                    const prompt = action.prompt || 'How can I help you?';
                    onContinue(prompt);
                  }
                }
                // Handle start another form
                else if (action.action === 'start_form' && action.formId) {
                  if (onStartForm) {
                    onStartForm(action.formId);
                  } else {
                    console.error('[FormCompletionCard] onStartForm callback not provided');
                  }
                }
                // Handle external link
                else if (action.action === 'external_link' && action.url) {
                  // Open URL in new tab
                  window.open(action.url, '_blank', 'noopener,noreferrer');
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