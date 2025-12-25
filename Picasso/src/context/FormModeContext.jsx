import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useConfig } from '../hooks/useConfig';
import {
  FORM_VIEWED,
  FORM_STARTED,
  FORM_FIELD_SUBMITTED,
  FORM_COMPLETED,
  FORM_ABANDONED,
  FORM_ABANDON_REASONS
} from '../analytics/eventConstants.js';

const FormModeContext = createContext(null);

/**
 * Emit form analytics event via global notifyParentEvent
 * @param {string} eventType - Event type from eventConstants.js
 * @param {Object} payload - Event payload
 */
function emitFormEvent(eventType, payload) {
  if (typeof window !== 'undefined' && window.notifyParentEvent) {
    window.notifyParentEvent(eventType, payload);
  } else {
    console.warn('[FormModeContext] notifyParentEvent not available for:', eventType);
  }
}

export const useFormMode = () => {
  const context = useContext(FormModeContext);
  if (!context) {
    throw new Error('useFormMode must be used within FormModeProvider');
  }
  return context;
};

export const FormModeProvider = ({ children }) => {
  const { config: configData } = useConfig();
  // Core form state
  const [isFormMode, setIsFormMode] = useState(false);
  const [isSuspended, setIsSuspended] = useState(false); // NEW: Track if form is suspended
  const [currentFormId, setCurrentFormId] = useState(null);
  const [currentFieldIndex, setCurrentFieldIndex] = useState(0);
  const [formData, setFormData] = useState({});
  const [formConfig, setFormConfig] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  const [suspendedForms, setSuspendedForms] = useState(new Map());
  const [formMetadata, setFormMetadata] = useState({
    startedAt: null,
    lastActiveAt: null
  });

  // Analytics: Track if FORM_STARTED has been emitted for current form
  const formStartedEmittedRef = useRef(false);

  // Form completion state
  const [isFormComplete, setIsFormComplete] = useState(false);
  const [completedFormData, setCompletedFormData] = useState(null);
  const [completedFormConfig, setCompletedFormConfig] = useState(null);

  // Session storage key prefix
  const STORAGE_PREFIX = 'picasso_form_';
  const SESSION_ID = sessionStorage.getItem('picasso_session_id') ||
                      (() => {
                        const id = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                        sessionStorage.setItem('picasso_session_id', id);
                        return id;
                      })();

  // Load suspended forms from session storage on mount
  useEffect(() => {
    const loadSuspendedForms = () => {
      const forms = new Map();
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith(STORAGE_PREFIX)) {
          try {
            const data = JSON.parse(sessionStorage.getItem(key));
            // Check if form is still valid (30 minute TTL)
            if (data.suspendedAt && Date.now() - data.suspendedAt < 30 * 60 * 1000) {
              forms.set(data.formId, data);
            } else {
              // Clean up expired forms
              sessionStorage.removeItem(key);
            }
          } catch (e) {
            console.error('Error loading suspended form:', e);
          }
        }
      }
      setSuspendedForms(forms);
    };
    loadSuspendedForms();
  }, []);

  // Start a new form
  const startForm = useCallback((formId, triggerSource = 'config_lookup') => {
    console.log('[FormModeContext] Starting form:', formId);

    // Get form config from configData
    const formDef = configData?.conversational_forms?.[formId];
    if (!formDef) {
      console.error('[FormModeContext] Form config not found:', formId);
      return false;
    }

    // Reset form started tracking
    formStartedEmittedRef.current = false;

    setIsFormMode(true);
    setCurrentFormId(formId);
    setCurrentFieldIndex(0);
    setFormData({});
    setFormConfig(formDef);
    setValidationErrors({});
    setFormMetadata({
      startedAt: Date.now(),
      lastActiveAt: Date.now()
    });

    // Analytics: Emit FORM_VIEWED event
    emitFormEvent(FORM_VIEWED, {
      form_id: formId,
      form_label: formDef.title || formId,
      trigger_source: triggerSource,
      field_count: formDef.fields?.length || 0
    });

    return true;
  }, [configData]);

  // Start a new form with provided config (for dynamic forms from CTAs)
  const startFormWithConfig = useCallback((formId, formConfigParam, triggerSource = 'cta_trigger') => {
    console.log('[FormModeContext] Starting form with config:', formId, formConfigParam);
    console.log('[FormModeContext] Field count:', formConfigParam?.fields?.length);
    console.log('[FormModeContext] Fields with eligibility gates:',
      formConfigParam?.fields?.filter(f => f.eligibility_gate).map(f => ({ id: f.id, gate: f.eligibility_gate, msg: f.failure_message }))
    );

    if (!formConfigParam || !formConfigParam.fields) {
      console.error('[FormModeContext] Invalid form config provided:', formConfigParam);
      return false;
    }

    // Reset form started tracking
    formStartedEmittedRef.current = false;

    setIsFormMode(true);
    setCurrentFormId(formId);
    setCurrentFieldIndex(0);
    setFormData({});
    setFormConfig(formConfigParam);
    setValidationErrors({});
    setFormMetadata({
      startedAt: Date.now(),
      lastActiveAt: Date.now()
    });

    // Analytics: Emit FORM_VIEWED event
    emitFormEvent(FORM_VIEWED, {
      form_id: formId,
      form_label: formConfigParam.title || formId,
      trigger_source: triggerSource,
      field_count: formConfigParam.fields?.length || 0
    });

    return true;
  }, []);

  // Submit current field value
  const submitField = useCallback((fieldId, value) => {
    if (!formConfig || !formConfig.fields) return { valid: false, error: 'No form active' };

    const currentField = formConfig.fields[currentFieldIndex];
    if (!currentField) return { valid: false, error: 'Invalid field index' };

    // Basic validation
    if (currentField.required && !value) {
      const error = 'This field is required. Please provide a value.';
      setValidationErrors(prev => ({ ...prev, [currentField.id]: error }));
      return { valid: false, error };
    }

    // Type-specific validation
    if (currentField.type === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        const error = 'Please enter a valid email address (e.g., name@example.com)';
        setValidationErrors(prev => ({ ...prev, [currentField.id]: error }));
        return { valid: false, error };
      }
    }

    if (currentField.type === 'phone') {
      // Accept formats: +15551234567, (555) 123-4567, 555-123-4567, 5551234567
      const phoneRegex = /^[\d\s\-\(\)\+]+$/;
      const digitsOnly = value.replace(/\D/g, '');
      if (!phoneRegex.test(value) || digitsOnly.length < 10) {
        const error = 'Please enter a valid phone number (at least 10 digits)';
        setValidationErrors(prev => ({ ...prev, [currentField.id]: error }));
        return { valid: false, error };
      }
    }

    // Check eligibility gate
    if (currentField.eligibility_gate) {
      // Handle date fields with minimum_age requirement
      if (currentField.type === 'date' && currentField.minimum_age) {
        const birthDate = new Date(value);
        const today = new Date();

        // Calculate age
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        const dayDiff = today.getDate() - birthDate.getDate();

        // Adjust age if birthday hasn't occurred this year yet
        if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
          age--;
        }

        console.log('[FormModeContext] Age calculated:', {
          field: currentField.id,
          birthDate: value,
          calculatedAge: age,
          minimumAge: currentField.minimum_age
        });

        // Check if user meets minimum age requirement
        if (age < currentField.minimum_age) {
          const failureMessage = currentField.failure_message ||
            `You must be at least ${currentField.minimum_age} years old to qualify for this program.`;

          console.log('[FormModeContext] Age eligibility gate failed:', {
            field: currentField.id,
            age: age,
            minimumAge: currentField.minimum_age,
            message: failureMessage
          });

          // Delay form exit to allow overlay to display
          setTimeout(() => {
            console.log('[FormModeContext] Closing form after age eligibility failure delay');
            setIsFormMode(false);
            setIsSuspended(false);
            setCurrentFormId(null);
            setCurrentFieldIndex(0);
            setFormData({});
            setFormConfig(null);
            setValidationErrors({});
            setFormMetadata({
              startedAt: null,
              lastActiveAt: null
            });
          }, 2500);

          return {
            valid: true, // Allow the submission to process
            eligibilityFailed: true,
            failureMessage: failureMessage,
            exitForm: true
          };
        }
      }
      // Handle select/dropdown fields with options
      else if (currentField.options) {
        const selectedOption = currentField.options.find(opt =>
          opt.value.toLowerCase() === value.toLowerCase() ||
          opt.label.toLowerCase() === value.toLowerCase()
        );

        if (selectedOption && selectedOption.value === 'no') {
          // User doesn't qualify - show failure message and exit form gracefully
          const failureMessage = currentField.failure_message ||
            'Unfortunately, you don\'t meet the requirements for this program.';

          console.log('[FormModeContext] Eligibility gate failed:', {
            field: currentField.id,
            value: selectedOption.value,
            message: failureMessage
          });

          // Delay form exit to allow overlay to display
          setTimeout(() => {
            console.log('[FormModeContext] Closing form after eligibility failure delay');
            setIsFormMode(false);
            setIsSuspended(false);
            setCurrentFormId(null);
            setCurrentFieldIndex(0);
            setFormData({});
            setFormConfig(null);
            setValidationErrors({});
            setFormMetadata({
              startedAt: null,
              lastActiveAt: null
            });
          }, 2500);

          return {
            valid: true, // Allow the submission to process
            eligibilityFailed: true,
            failureMessage: failureMessage,
            exitForm: true
          };
        }
      }
    }

    // Store field value
    setFormData(prev => ({ ...prev, [currentField.id]: value }));
    setValidationErrors(prev => {
      const updated = { ...prev };
      delete updated[currentField.id];
      return updated;
    });

    // Update last active time
    setFormMetadata(prev => ({ ...prev, lastActiveAt: Date.now() }));

    // Analytics: Emit FORM_STARTED on first successful field submission
    if (!formStartedEmittedRef.current) {
      formStartedEmittedRef.current = true;
      emitFormEvent(FORM_STARTED, {
        form_id: currentFormId,
        field_count: formConfig.fields.length,
        start_time: new Date().toISOString()
      });
    }

    // Analytics: Emit FORM_FIELD_SUBMITTED for each successful field
    emitFormEvent(FORM_FIELD_SUBMITTED, {
      form_id: currentFormId,
      field_id: currentField.id,
      field_label: currentField.label || currentField.id,
      field_index: currentFieldIndex,
      field_type: currentField.type || 'text'
    });

    // SPECIAL CASE: Volunteer form program_interest field - pivot to specific form
    if (currentField.id === 'program_interest' && currentFormId === 'volunteer_apply') {
      console.log('[FormModeContext] Program interest selected:', value);

      const normalizedValue = value.toLowerCase();

      // Handle "Tell me more about both" - build query dynamically from available programs
      if (normalizedValue === 'both') {
        console.log('[FormModeContext] User wants to learn about both programs');

        // Build list of program names from field options
        const programOptions = currentField.options?.filter(opt =>
          opt.value !== 'both' && opt.value !== 'unsure'
        ) || [];

        const programNames = programOptions.map(opt => opt.label).join(' and ');
        const query = programNames ? `Tell me about ${programNames}` : 'Tell me about your programs';

        return {
          valid: true,
          exitForm: true,
          sendToBedrockQuery: query
        };
      }

      // Handle "I'm not sure yet"
      if (normalizedValue === 'unsure') {
        console.log('[FormModeContext] User is unsure, prompting for clarification');
        return {
          valid: true,
          exitForm: true,
          promptUser: 'How can I help you?',
          waitForResponse: true
        };
      }

      // Build program → form mapping dynamically from config
      // This maps program_interest values to their corresponding form IDs
      const formMap = {};
      if (configData?.conversational_forms) {
        Object.entries(configData.conversational_forms).forEach(([formKey, formConfig]) => {
          // Map form_id to config key (e.g., 'lb_apply' → 'lovebox_application')
          const formId = formConfig.form_id || formKey;
          formMap[formId] = formKey;
          formMap[formKey.toLowerCase()] = formKey;

          // Also try to extract from form title/name
          const title = formConfig.title?.toLowerCase() || '';
          if (title) {
            // Extract first word as potential match (e.g., "Love Box Application" → "lovebox")
            const firstWord = title.split(' ')[0];
            formMap[firstWord] = formKey;
          }
        });
      }

      const targetFormId = formMap[normalizedValue];

      if (targetFormId) {
        // Signal to pivot to specific form
        return {
          valid: true,
          pivotToForm: targetFormId,
          programInterest: value
        };
      }
    }

    // Move to next field or complete form
    if (currentFieldIndex < formConfig.fields.length - 1) {
      setCurrentFieldIndex(prev => prev + 1);
      return { valid: true, nextField: true };
    } else {
      // Form complete - store completion data
      const finalFormData = { ...formData, [currentField.id]: value };
      console.log('[FormModeContext] Form complete! Setting completion state:', {
        isFormComplete: true,
        completedFormData: finalFormData,
        completedFormConfig: formConfig,
        hasPostSubmission: !!formConfig.post_submission
      });

      // Calculate duration in seconds
      const durationSeconds = formMetadata.startedAt
        ? Math.round((Date.now() - formMetadata.startedAt) / 1000)
        : 0;

      // Analytics: Emit FORM_COMPLETED event
      emitFormEvent(FORM_COMPLETED, {
        form_id: currentFormId,
        form_label: formConfig.title || currentFormId,
        duration_seconds: durationSeconds,
        fields_completed: formConfig.fields.length
      });

      setIsFormComplete(true);
      setCompletedFormData(finalFormData);
      setCompletedFormConfig(formConfig);
      setIsFormMode(false); // Exit form mode

      return { valid: true, formComplete: true, formData: finalFormData };
    }
  }, [formConfig, currentFieldIndex, formData, currentFormId, formMetadata.startedAt]);

  // Suspend current form
  const suspendForm = useCallback((reason = 'user_request') => {
    if (!isFormMode || !currentFormId) return;

    console.log('[FormModeContext] Suspending form:', currentFormId, 'Reason:', reason);

    const suspendedData = {
      formId: currentFormId,
      formData,
      currentFieldIndex,
      suspendedAt: Date.now(),
      suspendReason: reason,
      formConfig,
      formTitle: formConfig?.title || 'your form'
    };

    // Save to session storage
    const storageKey = `${STORAGE_PREFIX}${currentFormId}_${SESSION_ID}`;
    sessionStorage.setItem(storageKey, JSON.stringify(suspendedData));

    // Update suspended forms map
    setSuspendedForms(prev => new Map(prev).set(currentFormId, suspendedData));

    // Mark as suspended but DON'T clear the form state yet
    // This keeps the form visible but in a "paused" state
    setIsSuspended(true);

    console.log('[FormModeContext] Form suspended, state preserved for resume');
  }, [isFormMode, currentFormId, formData, currentFieldIndex, formConfig]);

  // Resume a suspended form
  const resumeForm = useCallback((formId) => {
    const suspendedData = suspendedForms.get(formId);
    if (!suspendedData) {
      console.error('[FormModeContext] No suspended form found:', formId);
      return false;
    }

    console.log('[FormModeContext] Resuming form:', formId);

    setIsFormMode(true);
    setIsSuspended(false); // Clear suspended state
    setCurrentFormId(formId);
    setCurrentFieldIndex(suspendedData.currentFieldIndex);
    setFormData(suspendedData.formData);
    setFormConfig(suspendedData.formConfig);
    setValidationErrors({});
    setFormMetadata({
      startedAt: suspendedData.startedAt || Date.now(),
      lastActiveAt: Date.now()
    });

    // Remove from suspended forms
    setSuspendedForms(prev => {
      const updated = new Map(prev);
      updated.delete(formId);
      return updated;
    });

    // Clear from session storage
    const storageKey = `${STORAGE_PREFIX}${formId}_${SESSION_ID}`;
    sessionStorage.removeItem(storageKey);

    return true;
  }, [suspendedForms]);

  // Cancel current form
  const cancelForm = useCallback((reason = FORM_ABANDON_REASONS.CLOSED) => {
    if (!currentFormId) return;

    console.log('[FormModeContext] Cancelling form:', currentFormId, 'Reason:', reason);

    // Analytics: Emit FORM_ABANDONED event before clearing state
    const currentField = formConfig?.fields?.[currentFieldIndex];
    const durationSeconds = formMetadata.startedAt
      ? Math.round((Date.now() - formMetadata.startedAt) / 1000)
      : 0;

    // Only emit FORM_ABANDONED if user actually engaged with the form (FORM_STARTED fired)
    // This ensures Starts = Completions + Abandons for accurate funnel math
    if (formStartedEmittedRef.current) {
      emitFormEvent(FORM_ABANDONED, {
        form_id: currentFormId,
        form_label: formConfig.title || currentFormId,
        last_field_id: currentField?.id || null,
        last_field_label: currentField?.label || currentField?.id || null,
        last_field_index: currentFieldIndex,
        fields_completed: Object.keys(formData).length,
        total_fields: formConfig.fields.length,
        duration_seconds: durationSeconds,
        reason: reason
      });
    }

    // Clear from session storage if suspended
    const storageKey = `${STORAGE_PREFIX}${currentFormId}_${SESSION_ID}`;
    sessionStorage.removeItem(storageKey);

    // Reset all form state
    setIsFormMode(false);
    setIsSuspended(false); // Clear suspended state
    setCurrentFormId(null);
    setCurrentFieldIndex(0);
    setFormData({});
    setFormConfig(null);
    setValidationErrors({});
    setFormMetadata({
      startedAt: null,
      lastActiveAt: null
    });
  }, [currentFormId, formConfig, currentFieldIndex, formData, formMetadata.startedAt]);

  // Detect interruption in user input
  const detectInterruption = useCallback((text) => {
    if (!text) return { type: 'CONTINUE', confidence: 1.0 };

    const normalized = text.toLowerCase().trim();

    // Cancel patterns
    if (/\b(cancel|stop|exit|quit|nevermind|forget it)\b/.test(normalized)) {
      return { type: 'CANCEL', confidence: 0.95 };
    }

    // Question patterns
    if (normalized.includes('?') ||
        /^(what|why|how|when|where|who)\b/.test(normalized) ||
        /\b(tell me|explain|help me understand)\b/.test(normalized)) {
      return { type: 'QUESTION', confidence: 0.85 };
    }

    // Change of mind / switching programs patterns
    if (/\b(actually|instead|rather|prefer|change|different|other)\b/.test(normalized) &&
        /\b(apply|interested|want|like|program|volunteer)\b/.test(normalized)) {
      return { type: 'QUESTION', confidence: 0.90 };
    }

    // General conversation / off-topic patterns
    if (/^(i want|i'd like|i would like|can i|could i|i'm interested|tell me about)\b/.test(normalized)) {
      return { type: 'QUESTION', confidence: 0.85 };
    }

    // Mistake patterns
    if (/\b(oops|wait|sorry|mistake|wrong|back|previous)\b/.test(normalized)) {
      return { type: 'MISTAKE', confidence: 0.80 };
    }

    // Form continuation
    return { type: 'CONTINUE', confidence: 1.0 };
  }, []);

  // Get current field info
  const getCurrentField = useCallback(() => {
    if (!formConfig || !formConfig.fields) return null;
    return formConfig.fields[currentFieldIndex];
  }, [formConfig, currentFieldIndex]);

  // Get form progress
  const getFormProgress = useCallback(() => {
    if (!formConfig || !formConfig.fields) return null;
    return {
      currentStep: currentFieldIndex + 1,
      totalSteps: formConfig.fields.length,
      percentComplete: Math.round(((currentFieldIndex + 1) / formConfig.fields.length) * 100)
    };
  }, [formConfig, currentFieldIndex]);

  // Get suspended form info
  const getSuspendedForm = useCallback((formId) => {
    return suspendedForms.get(formId);
  }, [suspendedForms]);

  // Clear completion state
  const clearCompletionState = useCallback(() => {
    setIsFormComplete(false);
    setCompletedFormData(null);
    setCompletedFormConfig(null);
  }, []);

  const value = {
    // State
    isFormMode,
    isSuspended, // NEW: Export suspended state
    currentFormId,
    currentFieldIndex,
    formData,
    formConfig,
    validationErrors,
    suspendedForms,
    formMetadata,
    isFormComplete,
    completedFormData,
    completedFormConfig,

    // Methods
    startForm,
    startFormWithConfig,
    submitField,
    suspendForm,
    resumeForm,
    cancelForm,
    detectInterruption,
    getCurrentField,
    getFormProgress,
    getSuspendedForm,
    clearCompletionState
  };

  return (
    <FormModeContext.Provider value={value}>
      {children}
    </FormModeContext.Provider>
  );
};

export default FormModeContext;