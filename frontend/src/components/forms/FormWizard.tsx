'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { cn } from '../utils';
import { Button } from '@/components/shadcn/button-extended';
import { Save, ChevronLeft, ChevronRight } from 'lucide-react';
import { Stepper, Step } from './Stepper';

export interface WizardFormData {
  [key: string]: any;
}

export interface FormWizardProps {
  steps: {
    id: string;
    title: string;
    description?: string;
    component: React.FC<{
      data: WizardFormData;
      onChange: (key: string, value: any) => void;
      errors: Record<string, string>;
      setErrors: (errors: Record<string, string>) => void;
      isValid: boolean;
      setIsValid: (valid: boolean) => void;
      saving?: boolean;
    }>;
    validate?: (data: WizardFormData) => Record<string, string> | null;
  }[];
  initialData?: WizardFormData;
  currentStep?: number;
  onSaveDraft?: (data: WizardFormData, step: number) => Promise<void>;
  onSubmit?: (data: WizardFormData) => Promise<void>;
  onSubmitLabel?: string;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

const FormWizard: React.FC<FormWizardProps> = ({
  steps,
  initialData = {},
  currentStep: controlledStep,
  onSaveDraft,
  onSubmit,
  onSubmitLabel = 'Submit Application',
  orientation = 'horizontal',
  className,
}) => {
  const [internalStep, setInternalStep] = useState(0);
  const currentStep = controlledStep !== undefined ? controlledStep : internalStep;
  const setCurrentStep = controlledStep !== undefined ? () => {} : setInternalStep;
  const [formData, setFormData] = useState<WizardFormData>(initialData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stepValidity, setStepValidity] = useState<boolean[]>(
    new Array(steps.length).fill(false)
  );
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const CurrentStepComponent = steps[currentStep].component;

  const handleChange = useCallback((key: string, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[key];
        return newErrors;
      });
    }
  }, [errors]);

  const validateCurrentStep = useCallback((): boolean => {
    const validate = steps[currentStep].validate;
    if (!validate) return true;

    const validationErrors = validate(formData);
    if (validationErrors) {
      setErrors(validationErrors);
      // Scroll to first error field
      setTimeout(() => {
        const firstErrorKey = Object.keys(validationErrors)[0];
        const errorEl = document.querySelector(`[name="${firstErrorKey}"], [id*="${firstErrorKey}"], [data-field="${firstErrorKey}"]`);
        if (errorEl) {
          errorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          // Fallback: scroll to first visible error message
          const errorMsg = document.querySelector('[style*="color: var(--color-red"]');
          if (errorMsg) {
            errorMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }, 100);
      return false;
    }
    setErrors({});
    return true;
  }, [currentStep, steps, formData]);

  const handleNext = useCallback(async () => {
    if (validateCurrentStep()) {
      setCurrentStep(prev => Math.min(prev + 1, steps.length - 1));
    }
  }, [validateCurrentStep, steps.length]);

  const handlePrevious = useCallback(() => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  }, []);

  const handleStepClick = useCallback((stepIndex: number) => {
    if (stepIndex <= currentStep) {
      setCurrentStep(stepIndex);
    }
  }, [currentStep]);

  const handleSaveDraft = useCallback(async () => {
    if (onSaveDraft) {
      setSaving(true);
      setSaveError(null);
      try {
        await onSaveDraft(formData, currentStep);
        setLastSavedTime(new Date());
        setShowSavedToast(true);
      } catch (error: any) {
        console.error('Failed to save draft:', error);
        setSaveError(error?.message || 'Failed to save draft. Please try again.');
      } finally {
        setSaving(false);
      }
    }
  }, [formData, currentStep, onSaveDraft]);

  useEffect(() => {
    if (!showSavedToast) return;
    const timer = setTimeout(() => setShowSavedToast(false), 3500);
    return () => clearTimeout(timer);
  }, [showSavedToast]);

  // Scroll to top whenever the step changes (Next/Back/stepper click)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentStep]);

  const handleSubmit = useCallback(async () => {
    if (validateCurrentStep()) {
      setSubmitting(true);
      try {
        if (onSubmit) {
          await onSubmit(formData);
        }
      } catch (error: any) {
        console.error('Failed to submit:', error);
        setErrors({ _submit: error.message || 'Submission failed. Please try again.' });
      } finally {
        setSubmitting(false);
      }
    }
  }, [validateCurrentStep, formData, onSubmit]);

  const updateStepValidity = useCallback((isValid: boolean) => {
    setStepValidity(prev => {
      const newValidity = [...prev];
      newValidity[currentStep] = isValid;
      return newValidity;
    });
  }, [currentStep]);

  // Validate current step on mount and when form data changes
  useEffect(() => {
    const validate = steps[currentStep].validate;
    if (validate) {
      const validationErrors = validate(formData);
      const isValid = !validationErrors;
      setStepValidity(prev => {
        const newValidity = [...prev];
        newValidity[currentStep] = isValid;
        return newValidity;
      });
    } else {
      // No validation means step is always valid
      setStepValidity(prev => {
        const newValidity = [...prev];
        newValidity[currentStep] = true;
        return newValidity;
      });
    }
  }, [currentStep, formData, steps]);

  const stepperSteps: Step[] = steps.map((step, index) => ({
    id: step.id,
    title: step.title,
    description: step.description,
    status:
      index === currentStep
        ? 'in-progress'
        : index < currentStep
        ? 'completed'
        : stepValidity[index]
        ? 'completed'
        : 'pending',
  }));

  const isLastStep = currentStep === steps.length - 1;

  return (
    <div className={cn('w-full', className)}>
      {showSavedToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg shadow-lg px-4 py-3 border"
          style={{ backgroundColor: '#ecfdf5', borderColor: '#10b981', color: '#065f46' }}
        >
          <Save className="w-4 h-4" />
          <span className="text-sm font-medium">Draft saved successfully</span>
        </div>
      )}

      <Stepper
        steps={stepperSteps}
        currentStep={currentStep}
        orientation={orientation}
        onStepClick={handleStepClick}
        className="mb-8"
      />

      <div className="card">
        <div className="p-6 md:p-8">
          {lastSavedTime && (
            <div className="mb-4 flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <Save className="w-4 h-4 text-green-600" />
              <span>Saved as draft at {lastSavedTime.toLocaleTimeString()}</span>
            </div>
          )}

          {errors._submit && (
            <div className="mb-4 p-4 rounded-lg border-l-4" style={{ backgroundColor: 'var(--color-red-50, #fef2f2)', borderLeftColor: 'var(--color-red-500, #ef4444)' }}>
              <p className="text-sm font-medium" style={{ color: 'var(--color-red-700, #b91c1c)' }}>{errors._submit}</p>
            </div>
          )}

          <CurrentStepComponent
            data={formData}
            onChange={handleChange}
            errors={errors}
            setErrors={setErrors}
            isValid={stepValidity[currentStep] || false}
            setIsValid={updateStepValidity}
            saving={saving}
          />
        </div>

        <div className="border-t px-6 py-4 flex items-center justify-between gap-4" style={{ borderColor: 'var(--border-primary)' }}>
          {currentStep > 0 && (
            <Button
              variant="ghost"
              onClick={handlePrevious}
              disabled={submitting}
              leftIcon={<ChevronLeft className="w-4 h-4" />}
            >
              Back
            </Button>
          )}
          {currentStep === 0 && <div />}

          <div className="flex items-center gap-3">
            {saveError && (
              <span className="text-sm" style={{ color: '#b91c1c' }}>{saveError}</span>
            )}
            {onSaveDraft && (
              <Button
                variant="secondary"
                onClick={handleSaveDraft}
                disabled={saving || submitting}
                loading={saving}
                leftIcon={<Save className="w-4 h-4" />}
              >
                Save as Draft
              </Button>
            )}

            {isLastStep ? (
              <Button
                variant="primary"
                onClick={handleSubmit}
                disabled={submitting}
                loading={submitting}
                rightIcon={<ChevronRight className="w-4 h-4" />}
              >
                {onSubmitLabel}
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={handleNext}
                disabled={submitting}
                rightIcon={<ChevronRight className="w-4 h-4" />}
              >
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

FormWizard.displayName = 'FormWizard';

export { FormWizard };
