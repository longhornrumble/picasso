import React, { useState } from 'react';

/**
 * CompositeFieldGroup Component
 * Renders a group of related fields together in one step.
 * Supports: name, address, phone_with_consent
 */
export default function CompositeFieldGroup({ field, onSubmit, inputRef, labelId }) {
  // State for all subfields
  const [values, setValues] = useState(() => {
    const initialValues = {};
    (field.subfields || []).forEach(subfield => {
      initialValues[subfield.id] = '';
    });
    return initialValues;
  });

  const [errors, setErrors] = useState({});

  const handleChange = (subfieldId, value) => {
    // Auto-capitalize first character for name-type composite fields
    const normalized = (field.type === 'name' && typeof value === 'string' && value.length > 0)
      ? value.charAt(0).toUpperCase() + value.slice(1)
      : value;
    setValues(prev => ({
      ...prev,
      [subfieldId]: normalized
    }));
    // Clear error for this field when user types
    if (errors[subfieldId]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[subfieldId];
        return newErrors;
      });
    }
  };

  const validateField = (subfield, value) => {
    // Check required
    if (subfield.required && !value.trim()) {
      return `${subfield.label} is required`;
    }

    // Phone validation for phone subfields
    if (subfield.type === 'phone' && value) {
      const digitsOnly = value.replace(/\D/g, '');
      if (value.length > 20) {
        return 'Phone number is too long';
      } else if (digitsOnly.length < 7) {
        return 'Phone number must have at least 7 digits';
      } else if (!/^[\d\s\-\(\)\+]+$/.test(value)) {
        return 'Please enter a valid phone number';
      }
    }

    // Check pattern validation
    if (value && subfield.validation?.pattern) {
      const regex = new RegExp(subfield.validation.pattern);
      if (!regex.test(value)) {
        return subfield.validation.message || `Invalid ${subfield.label}`;
      }
    }

    return null;
  };

  const handleSubmit = (e) => {
    e?.preventDefault();

    const newErrors = {};
    let hasErrors = false;

    // Validate all subfields
    field.subfields.forEach(subfield => {
      const value = values[subfield.id] || '';
      // Skip validation for select subfields — they use button clicks
      if (subfield.type === 'select') return;
      const error = validateField(subfield, value);
      if (error) {
        newErrors[subfield.id] = error;
        hasErrors = true;
      }
    });

    if (hasErrors) {
      setErrors(newErrors);
      return;
    }

    // All valid - submit the composite field data
    onSubmit(values);
  };

  // Check if form is valid (all required fields filled)
  const isValid = field.subfields.every(subfield => {
    if (!subfield.required) return true;
    if (subfield.type === 'select') {
      // Select subfields are valid if any option was chosen
      return !!values[subfield.id];
    }
    return values[subfield.id]?.trim();
  });

  // phone_with_consent: render phone input + consent toggle in one step
  if (field.type === 'phone_with_consent') {
    const phoneSubfield = field.subfields.find(sf => sf.type === 'phone');
    const consentSubfield = field.subfields.find(sf => sf.type === 'select');

    return (
      <form onSubmit={handleSubmit} className="composite-field-group" aria-labelledby={labelId}>
        <div className="composite-field-container">
          {/* Phone input */}
          {phoneSubfield && (
            <div className="composite-field-item">
              <label htmlFor={phoneSubfield.id} className="composite-field-label">
                {phoneSubfield.label}
                {phoneSubfield.required && <span className="required-indicator">*</span>}
              </label>
              <input
                ref={inputRef}
                id={phoneSubfield.id}
                name={phoneSubfield.id}
                type="tel"
                className={`composite-field-input ${errors[phoneSubfield.id] ? 'error' : ''}`}
                value={values[phoneSubfield.id] || ''}
                onChange={(e) => handleChange(phoneSubfield.id, e.target.value)}
                placeholder={phoneSubfield.placeholder || '(555) 123-4567'}
                required={phoneSubfield.required}
                aria-describedby={errors[phoneSubfield.id] ? `error-${phoneSubfield.id}` : undefined}
              />
              {errors[phoneSubfield.id] && (
                <div id={`error-${phoneSubfield.id}`} className="composite-field-error" role="alert" aria-live="polite">
                  {errors[phoneSubfield.id]}
                </div>
              )}
            </div>
          )}

          {/* SMS Consent toggle */}
          {consentSubfield && (
            <div className="composite-field-item" style={{ marginTop: '12px' }}>
              <label className="composite-field-label" id={`label-${consentSubfield.id}`}>
                {consentSubfield.label || consentSubfield.prompt}
              </label>
              {consentSubfield.disclosure && (
                <div className="form-field-hint" style={{ marginBottom: '8px', fontSize: '12px', lineHeight: '1.4' }}>
                  {consentSubfield.disclosure}
                </div>
              )}
              <div
                className="form-select-options"
                role="group"
                aria-labelledby={`label-${consentSubfield.id}`}
              >
                {(consentSubfield.options || []).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`form-select-option ${values[consentSubfield.id] === option.value ? 'selected' : ''}`}
                    onClick={() => handleChange(consentSubfield.id, option.value)}
                    aria-pressed={values[consentSubfield.id] === option.value}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          type="submit"
          className="form-submit-button"
          disabled={!isValid}
        >
          Submit
        </button>
      </form>
    );
  }

  // Default rendering for name, address composites
  return (
    <form onSubmit={handleSubmit} className="composite-field-group" aria-labelledby={labelId}>
      <div className="composite-field-container">
        {field.subfields.map((subfield, index) => (
          <div key={subfield.id} className="composite-field-item">
            <label
              htmlFor={subfield.id}
              className="composite-field-label"
            >
              {subfield.label}
              {subfield.required && <span className="required-indicator">*</span>}
            </label>
            <input
              ref={index === 0 ? inputRef : null}
              id={subfield.id}
              name={subfield.id}
              type="text"
              className={`composite-field-input ${errors[subfield.id] ? 'error' : ''}`}
              value={values[subfield.id] || ''}
              onChange={(e) => handleChange(subfield.id, e.target.value)}
              placeholder={subfield.placeholder || ''}
              required={subfield.required}
              aria-describedby={errors[subfield.id] ? `error-${subfield.id}` : undefined}
            />
            {errors[subfield.id] && (
              <div
                id={`error-${subfield.id}`}
                className="composite-field-error"
                role="alert"
                aria-live="polite"
              >
                {errors[subfield.id]}
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        type="submit"
        className="form-submit-button"
        disabled={!isValid}
      >
        Submit
      </button>
    </form>
  );
}
