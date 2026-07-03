// src/components/forms/CompositeFieldGroup.jsx
//
// Hairline redesign (W4.1): multi-field groups (name/address/
// phone_with_consent) restyled to a grouped hairline card
// (`.hairline-composite*`); the phone_with_consent Yes/No toggle reuses
// the shared `.hairline-form-menu*` menu-row classes (select-buttons =
// menu rows, per HAIRLINE_REDESIGN_MAPPING.md §4 item 1). Unmocked
// surface — see FormFieldPrompt.jsx's header comment. Styles live in
// src/styles/hairline-forms.css.
//
// FROZEN (do not change): per-subfield required/pattern/phone validation,
// the name-field auto-capitalize normalization, and the `onSubmit(values)`
// payload shape.
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
      <form onSubmit={handleSubmit} className="hairline-composite" aria-labelledby={labelId}>
        <div className="hairline-composite-group">
          {/* Phone input */}
          {phoneSubfield && (
            <div className="hairline-composite-item">
              <label htmlFor={phoneSubfield.id} className="hairline-composite-label">
                {phoneSubfield.label}
                {phoneSubfield.required && <span className="hairline-composite-required" aria-hidden="true">*</span>}
              </label>
              <input
                ref={inputRef}
                id={phoneSubfield.id}
                name={phoneSubfield.id}
                type="tel"
                className={`hairline-composite-input${errors[phoneSubfield.id] ? ' hairline-composite-input--error' : ''}`}
                value={values[phoneSubfield.id] || ''}
                onChange={(e) => handleChange(phoneSubfield.id, e.target.value)}
                placeholder={phoneSubfield.placeholder || '(555) 123-4567'}
                required={phoneSubfield.required}
                aria-describedby={errors[phoneSubfield.id] ? `error-${phoneSubfield.id}` : undefined}
              />
              {errors[phoneSubfield.id] && (
                <div id={`error-${phoneSubfield.id}`} className="hairline-composite-error" role="alert" aria-live="polite">
                  {errors[phoneSubfield.id]}
                </div>
              )}
            </div>
          )}

          {/* SMS Consent toggle */}
          {consentSubfield && (
            <div className="hairline-composite-item hairline-composite-consent">
              <label className="hairline-composite-label" id={`label-${consentSubfield.id}`}>
                {consentSubfield.label || consentSubfield.prompt}
              </label>
              {consentSubfield.disclosure && (
                <div className="hairline-composite-hint">
                  {consentSubfield.disclosure}
                </div>
              )}
              <div
                className="hairline-form-menu"
                role="group"
                aria-labelledby={`label-${consentSubfield.id}`}
              >
                {(consentSubfield.options || []).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`hairline-form-menu-row${values[consentSubfield.id] === option.value ? ' hairline-form-menu-row--selected' : ''}`}
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
          className="hairline-form-submit"
          disabled={!isValid}
        >
          Submit
        </button>
      </form>
    );
  }

  // Default rendering for name, address composites
  return (
    <form onSubmit={handleSubmit} className="hairline-composite" aria-labelledby={labelId}>
      <div className="hairline-composite-group">
        {field.subfields.map((subfield, index) => (
          <div key={subfield.id} className="hairline-composite-item">
            <label
              htmlFor={subfield.id}
              className="hairline-composite-label"
            >
              {subfield.label}
              {subfield.required && <span className="hairline-composite-required" aria-hidden="true">*</span>}
            </label>
            <input
              ref={index === 0 ? inputRef : null}
              id={subfield.id}
              name={subfield.id}
              type="text"
              className={`hairline-composite-input${errors[subfield.id] ? ' hairline-composite-input--error' : ''}`}
              value={values[subfield.id] || ''}
              onChange={(e) => handleChange(subfield.id, e.target.value)}
              placeholder={subfield.placeholder || ''}
              required={subfield.required}
              aria-describedby={errors[subfield.id] ? `error-${subfield.id}` : undefined}
            />
            {errors[subfield.id] && (
              <div
                id={`error-${subfield.id}`}
                className="hairline-composite-error"
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
        className="hairline-form-submit"
        disabled={!isValid}
      >
        Submit
      </button>
    </form>
  );
}
