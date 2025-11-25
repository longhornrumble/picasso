import React, { useState } from 'react';

/**
 * CompositeFieldGroup Component
 * Renders a group of related fields (name or address) together in one step
 */
export default function CompositeFieldGroup({ field, onSubmit, inputRef }) {
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
    setValues(prev => ({
      ...prev,
      [subfieldId]: value
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
    return values[subfield.id]?.trim();
  });

  return (
    <form onSubmit={handleSubmit} className="composite-field-group">
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
