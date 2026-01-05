import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import FormCompletionCard from '../FormCompletionCard';

describe('FormCompletionCard', () => {
  const mockFormData = {
    field_1: 'John',
    field_2: 'Doe',
    field_3: 'john@example.com'
  };

  const mockFormFields = [
    { id: 'field_1', label: 'First Name', type: 'text' },
    { id: 'field_2', label: 'Last Name', type: 'text' },
    { id: 'field_3', label: 'Email', type: 'email' }
  ];

  const mockConfig = {
    confirmation_message: 'Thank you for submitting!',
    next_steps: [
      'Step 1: We will review',
      'Step 2: Someone will contact you',
      'Step 3: Check your email'
    ],
    actions: [
      {
        id: 'continue',
        label: 'Continue Chat',
        action: 'continue'
      },
      {
        id: 'end_session',
        label: 'End Session',
        action: 'end_session'
      }
    ]
  };

  describe('Basic Rendering', () => {
    test('renders form completion card with config', () => {
      render(
        <FormCompletionCard
          formId="test-form"
          formData={mockFormData}
          formFields={mockFormFields}
          config={mockConfig}
          onEndSession={() => {}}
          onContinue={() => {}}
        />
      );

      // Check for success header
      expect(screen.getByText('Form Submitted')).toBeInTheDocument();

      // Check for confirmation message
      expect(screen.getByText(mockConfig.confirmation_message)).toBeInTheDocument();

      // Check for next steps
      expect(screen.getByText('What happens next:')).toBeInTheDocument();
      mockConfig.next_steps.forEach(step => {
        expect(screen.getByText(step)).toBeInTheDocument();
      });

      // Check for action buttons
      expect(screen.getByText('Continue Chat')).toBeInTheDocument();
      expect(screen.getByText('End Session')).toBeInTheDocument();
    });

    test('renders form data summary', () => {
      render(
        <FormCompletionCard
          formId="test-form"
          formData={mockFormData}
          formFields={mockFormFields}
          config={mockConfig}
          onEndSession={() => {}}
          onContinue={() => {}}
        />
      );

      // Check that form data is displayed
      expect(screen.getByText('Your Information:')).toBeInTheDocument();
      expect(screen.getByText(/First Name:/)).toBeInTheDocument();
      expect(screen.getByText(/John/)).toBeInTheDocument();
      expect(screen.getByText(/Last Name:/)).toBeInTheDocument();
      expect(screen.getByText(/Doe/)).toBeInTheDocument();
    });
  });

  describe('Fallback Behavior', () => {
    test('uses default config when no config provided', () => {
      render(
        <FormCompletionCard
          formId="test-form"
          formData={mockFormData}
          formFields={mockFormFields}
          config={null}
          onEndSession={() => {}}
          onContinue={() => {}}
        />
      );

      // Should show default message
      expect(screen.getByText(/Thank you for submitting your information/)).toBeInTheDocument();

      // Should show default next steps
      expect(screen.getByText("We'll review your information")).toBeInTheDocument();
      expect(screen.getByText("Someone from our team will reach out to you")).toBeInTheDocument();
      expect(screen.getByText("Check your email for updates")).toBeInTheDocument();
    });

    test('uses default next_steps when config missing next_steps', () => {
      const incompleteConfig = {
        confirmation_message: 'Custom message',
        actions: []
      };

      render(
        <FormCompletionCard
          formId="test-form"
          formData={mockFormData}
          formFields={mockFormFields}
          config={incompleteConfig}
          onEndSession={() => {}}
          onContinue={() => {}}
        />
      );

      // Should show custom confirmation message
      expect(screen.getByText('Custom message')).toBeInTheDocument();

      // Should show DEFAULT next steps (this is the bug fix!)
      expect(screen.getByText("We'll review your information")).toBeInTheDocument();
      expect(screen.getByText("Someone from our team will reach out to you")).toBeInTheDocument();
      expect(screen.getByText("Check your email for updates")).toBeInTheDocument();
    });

    test('uses default confirmation_message when config missing it', () => {
      const incompleteConfig = {
        next_steps: ['Custom step 1', 'Custom step 2'],
        actions: []
      };

      render(
        <FormCompletionCard
          formId="test-form"
          formData={mockFormData}
          formFields={mockFormFields}
          config={incompleteConfig}
          onEndSession={() => {}}
          onContinue={() => {}}
        />
      );

      // Should show default confirmation message
      expect(screen.getByText(/Thank you for submitting your information/)).toBeInTheDocument();

      // Should show custom next steps
      expect(screen.getByText('Custom step 1')).toBeInTheDocument();
      expect(screen.getByText('Custom step 2')).toBeInTheDocument();
    });

    test('uses default actions when config missing actions', () => {
      const incompleteConfig = {
        confirmation_message: 'Custom message',
        next_steps: ['Step 1']
      };

      render(
        <FormCompletionCard
          formId="test-form"
          formData={mockFormData}
          formFields={mockFormFields}
          config={incompleteConfig}
          onEndSession={() => {}}
          onContinue={() => {}}
        />
      );

      // Should show default action buttons
      expect(screen.getByText('Continue Chat')).toBeInTheDocument();
      expect(screen.getByText('End Session')).toBeInTheDocument();
    });

    test('handles empty config object', () => {
      render(
        <FormCompletionCard
          formId="test-form"
          formData={mockFormData}
          formFields={mockFormFields}
          config={{}}
          onEndSession={() => {}}
          onContinue={() => {}}
        />
      );

      // Should use all defaults
      expect(screen.getByText(/Thank you for submitting your information/)).toBeInTheDocument();
      expect(screen.getByText("We'll review your information")).toBeInTheDocument();
      expect(screen.getByText('Continue Chat')).toBeInTheDocument();
    });
  });

  describe('Austin Angels Bug Fix - Real-world Config', () => {
    test('renders Austin Angels form config with 6 next_steps', () => {
      const austinAngelsConfig = {
        confirmation_message: "That's it! Thank you for your interest in becoming a mentor with Austin Angels.\n\nHere's what happens next.",
        next_steps: [
          "Your application will be reviewed within 24 hours.",
          "We'll schedule in intake call to discuss your application and the program.",
          "Pay Dare to Dream Fees and sign waiver and confidentiality forms.",
          "Complete background screening",
          "Mentor onboarding and training.",
          "Mentor and mentee matching!"
        ],
        actions: []
      };

      render(
        <FormCompletionCard
          formId="apply_dare2dream"
          formData={mockFormData}
          formFields={mockFormFields}
          config={austinAngelsConfig}
          onEndSession={() => {}}
          onContinue={() => {}}
        />
      );

      // Check confirmation message
      expect(screen.getByText(/That's it! Thank you for your interest in becoming a mentor with Austin Angels/)).toBeInTheDocument();

      // Check all 6 next steps are rendered
      expect(screen.getByText("Your application will be reviewed within 24 hours.")).toBeInTheDocument();
      expect(screen.getByText("We'll schedule in intake call to discuss your application and the program.")).toBeInTheDocument();
      expect(screen.getByText("Pay Dare to Dream Fees and sign waiver and confidentiality forms.")).toBeInTheDocument();
      expect(screen.getByText("Complete background screening")).toBeInTheDocument();
      expect(screen.getByText("Mentor onboarding and training.")).toBeInTheDocument();
      expect(screen.getByText("Mentor and mentee matching!")).toBeInTheDocument();

      // Should NOT show default next steps
      expect(screen.queryByText("We'll review your information")).not.toBeInTheDocument();
      expect(screen.queryByText("Someone from our team will reach out to you")).not.toBeInTheDocument();
    });
  });

  describe('Action Handlers', () => {
    test('calls onEndSession when End Session clicked', () => {
      const mockEndSession = jest.fn();

      render(
        <FormCompletionCard
          formId="test-form"
          formData={mockFormData}
          formFields={mockFormFields}
          config={mockConfig}
          onEndSession={mockEndSession}
          onContinue={() => {}}
        />
      );

      const endButton = screen.getByText('End Session');
      fireEvent.click(endButton);

      expect(mockEndSession).toHaveBeenCalledTimes(1);
    });

    test('calls onContinue when Continue Chat clicked', () => {
      const mockContinue = jest.fn();

      render(
        <FormCompletionCard
          formId="test-form"
          formData={mockFormData}
          formFields={mockFormFields}
          config={mockConfig}
          onEndSession={() => {}}
          onContinue={mockContinue}
        />
      );

      const continueButton = screen.getByText('Continue Chat');
      fireEvent.click(continueButton);

      expect(mockContinue).toHaveBeenCalledTimes(1);
    });
  });

  describe('Composite Field Rendering', () => {
    test('renders name composite field', () => {
      const compositeFormData = {
        'full_name.first_name': 'John',
        'full_name.middle_name': 'Q',
        'full_name.last_name': 'Public'
      };

      const compositeFormFields = [
        {
          id: 'full_name',
          type: 'name',
          label: 'Full Name'
        }
      ];

      render(
        <FormCompletionCard
          formId="test-form"
          formData={compositeFormData}
          formFields={compositeFormFields}
          config={mockConfig}
          onEndSession={() => {}}
          onContinue={() => {}}
        />
      );

      // Should render name as "First Middle Last"
      expect(screen.getByText(/John Q Public/)).toBeInTheDocument();
    });

    test('renders address composite field', () => {
      const compositeFormData = {
        'address.street': '123 Main St',
        'address.apt_unit': 'Apt 4B',
        'address.city': 'Austin',
        'address.state': 'TX',
        'address.zip_code': '78701'
      };

      const compositeFormFields = [
        {
          id: 'address',
          type: 'address',
          label: 'Address'
        }
      ];

      render(
        <FormCompletionCard
          formId="test-form"
          formData={compositeFormData}
          formFields={compositeFormFields}
          config={mockConfig}
          onEndSession={() => {}}
          onContinue={() => {}}
        />
      );

      // Should render address on multiple lines
      expect(screen.getByText(/123 Main St, Apt 4B/)).toBeInTheDocument();
      expect(screen.getByText(/Austin, TX 78701/)).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    test('handles empty next_steps array', () => {
      const emptyStepsConfig = {
        confirmation_message: 'Thank you!',
        next_steps: [],
        actions: []
      };

      render(
        <FormCompletionCard
          formId="test-form"
          formData={mockFormData}
          formFields={mockFormFields}
          config={emptyStepsConfig}
          onEndSession={() => {}}
          onContinue={() => {}}
        />
      );

      // Should not render next steps section at all
      expect(screen.queryByText('What happens next:')).not.toBeInTheDocument();
    });

    test('handles empty actions array', () => {
      const emptyActionsConfig = {
        confirmation_message: 'Thank you!',
        next_steps: ['Step 1'],
        actions: []
      };

      render(
        <FormCompletionCard
          formId="test-form"
          formData={mockFormData}
          formFields={mockFormFields}
          config={emptyActionsConfig}
          onEndSession={() => {}}
          onContinue={() => {}}
        />
      );

      // Should not render actions section at all
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    test('handles null formData', () => {
      render(
        <FormCompletionCard
          formId="test-form"
          formData={null}
          formFields={mockFormFields}
          config={mockConfig}
          onEndSession={() => {}}
          onContinue={() => {}}
        />
      );

      // Should not crash - should still render confirmation and next steps
      expect(screen.getByText(mockConfig.confirmation_message)).toBeInTheDocument();
    });

    test('handles null formFields', () => {
      render(
        <FormCompletionCard
          formId="test-form"
          formData={mockFormData}
          formFields={null}
          config={mockConfig}
          onEndSession={() => {}}
          onContinue={() => {}}
        />
      );

      // Should not crash - should still render confirmation and next steps
      expect(screen.getByText(mockConfig.confirmation_message)).toBeInTheDocument();
    });
  });
});
