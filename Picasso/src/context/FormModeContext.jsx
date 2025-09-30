import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useConfig } from '../hooks/useConfig';

const FormModeContext = createContext(null);

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
  const startForm = useCallback((formId) => {
    console.log('[FormModeContext] Starting form:', formId);

    // Get form config from configData
    const formDef = configData?.conversational_forms?.[formId];
    if (!formDef) {
      console.error('[FormModeContext] Form config not found:', formId);
      return false;
    }

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

    return true;
  }, [configData]);

  // Start a new form with provided config (for dynamic forms from CTAs)
  const startFormWithConfig = useCallback((formId, formConfig) => {
    console.log('[FormModeContext] Starting form with config:', formId, formConfig);

    if (!formConfig || !formConfig.fields) {
      console.error('[FormModeContext] Invalid form config provided:', formConfig);
      return false;
    }

    setIsFormMode(true);
    setCurrentFormId(formId);
    setCurrentFieldIndex(0);
    setFormData({});
    setFormConfig(formConfig);
    setValidationErrors({});
    setFormMetadata({
      startedAt: Date.now(),
      lastActiveAt: Date.now()
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
    // Email validation handled by browser's native type="email" validation
    // Phone validation: accept any non-empty value (validation can be added later if needed)

    // Check eligibility gate
    if (currentField.eligibility_gate && currentField.options) {
      const selectedOption = currentField.options.find(opt =>
        opt.value.toLowerCase() === value.toLowerCase() ||
        opt.label.toLowerCase() === value.toLowerCase()
      );

      if (selectedOption && selectedOption.value === 'no') {
        // User doesn't qualify - exit form gracefully
        const failureMessage = currentField.failure_message ||
          'Unfortunately, you don\'t meet the requirements for this program.';

        cancelForm();
        return {
          valid: false,
          error: failureMessage,
          exitForm: true
        };
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

    // Move to next field or complete form
    if (currentFieldIndex < formConfig.fields.length - 1) {
      setCurrentFieldIndex(prev => prev + 1);
      return { valid: true, nextField: true };
    } else {
      // Form complete - store completion data
      const finalFormData = { ...formData, [currentField.id]: value };
      setIsFormComplete(true);
      setCompletedFormData(finalFormData);
      setCompletedFormConfig(formConfig);
      setIsFormMode(false); // Exit form mode

      return { valid: true, formComplete: true, formData: finalFormData };
    }
  }, [formConfig, currentFieldIndex, formData]);

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

    // Clear current form state
    setIsFormMode(false);
    setCurrentFormId(null);
    setCurrentFieldIndex(0);
    setFormConfig(null);
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
  const cancelForm = useCallback(() => {
    if (!currentFormId) return;

    console.log('[FormModeContext] Cancelling form:', currentFormId);

    // Clear from session storage if suspended
    const storageKey = `${STORAGE_PREFIX}${currentFormId}_${SESSION_ID}`;
    sessionStorage.removeItem(storageKey);

    // Reset all form state
    setIsFormMode(false);
    setCurrentFormId(null);
    setCurrentFieldIndex(0);
    setFormData({});
    setFormConfig(null);
    setValidationErrors({});
    setFormMetadata({
      startedAt: null,
      lastActiveAt: null
    });
  }, [currentFormId]);

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