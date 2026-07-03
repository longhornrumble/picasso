/**
 * CompositeFieldGroup — Hairline forms suite tests (W4.1)
 *
 * Multi-field groups (name, address, phone_with_consent) restyled to
 * grouped Hairline cards (`.hairline-composite*`), select-buttons (the
 * phone_with_consent Yes/No toggle) restyled as Hairline menu rows
 * (`.hairline-form-menu*`, shared with FormFieldPrompt's `select` field
 * type). Frozen behavior asserted alongside the restyle: per-subfield
 * required/pattern/phone validation, the auto-capitalize-on-name-fields
 * normalization, the mutually-exclusive consent toggle (`aria-pressed`),
 * and the `onSubmit(values)` payload shape.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import CompositeFieldGroup from '../CompositeFieldGroup';

describe('CompositeFieldGroup — Hairline forms suite', () => {
  describe('name composite (default rendering)', () => {
    const nameField = {
      id: 'full_name',
      type: 'name',
      subfields: [
        { id: 'full_name.first_name', label: 'First name', required: true },
        { id: 'full_name.last_name', label: 'Last name', required: true },
      ],
    };

    test('renders a grouped hairline card with one item per subfield', () => {
      render(<CompositeFieldGroup field={nameField} onSubmit={jest.fn()} inputRef={{ current: null }} labelId="label-full_name" />);

      const group = document.querySelector('.hairline-composite-group');
      expect(group).toBeInTheDocument();
      expect(group.querySelectorAll('.hairline-composite-item')).toHaveLength(2);
      expect(screen.getByLabelText(/First name/)).toHaveClass('hairline-composite-input');
    });

    test('submit stays disabled while required subfields are empty (frozen isValid gate)', () => {
      const onSubmit = jest.fn();
      render(<CompositeFieldGroup field={nameField} onSubmit={onSubmit} inputRef={{ current: null }} labelId="label-full_name" />);

      const submitButton = screen.getByRole('button', { name: 'Submit' });
      expect(submitButton).toBeDisabled();

      fireEvent.change(screen.getByLabelText(/First name/), { target: { value: 'Jamie' } });
      expect(submitButton).toBeDisabled(); // last name still empty

      fireEvent.change(screen.getByLabelText(/Last name/), { target: { value: 'Rivera' } });
      expect(submitButton).not.toBeDisabled();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    test('directly submitting the form with empty required subfields renders accessible errors', () => {
      const onSubmit = jest.fn();
      const { container } = render(
        <CompositeFieldGroup field={nameField} onSubmit={onSubmit} inputRef={{ current: null }} labelId="label-full_name" />
      );

      // Bypasses the disabled submit button to exercise handleSubmit's
      // validateField loop directly (frozen validation logic).
      fireEvent.submit(container.querySelector('form'));

      expect(onSubmit).not.toHaveBeenCalled();
      const errors = screen.getAllByRole('alert');
      expect(errors).toHaveLength(2);
      errors.forEach((err) => {
        expect(err).toHaveAttribute('aria-live', 'polite');
        expect(err).toHaveClass('hairline-composite-error');
      });
    });

    test('auto-capitalizes the first character and submits the collected values', () => {
      const onSubmit = jest.fn();
      render(<CompositeFieldGroup field={nameField} onSubmit={onSubmit} inputRef={{ current: null }} labelId="label-full_name" />);

      fireEvent.change(screen.getByLabelText(/First name/), { target: { value: 'jamie' } });
      fireEvent.change(screen.getByLabelText(/Last name/), { target: { value: 'rivera' } });
      expect(screen.getByLabelText(/First name/)).toHaveValue('Jamie');

      fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
      expect(onSubmit).toHaveBeenCalledWith({
        'full_name.first_name': 'Jamie',
        'full_name.last_name': 'Rivera',
      });
    });

    test('invalid input marks the field with the Hairline error border modifier', () => {
      const patternField = {
        id: 'contact',
        type: 'address',
        subfields: [
          {
            id: 'contact.zip',
            label: 'ZIP code',
            required: true,
            validation: { pattern: '^\\d{5}$', message: 'Enter a 5-digit ZIP code' },
          },
        ],
      };
      render(<CompositeFieldGroup field={patternField} onSubmit={jest.fn()} inputRef={{ current: null }} labelId="label-contact" />);

      fireEvent.change(screen.getByLabelText(/ZIP code/), { target: { value: 'abc' } });
      fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

      expect(screen.getByText('Enter a 5-digit ZIP code')).toBeInTheDocument();
      expect(screen.getByLabelText(/ZIP code/)).toHaveClass('hairline-composite-input--error');
    });
  });

  describe('phone_with_consent composite', () => {
    const phoneConsentField = {
      id: 'sms_opt_in',
      type: 'phone_with_consent',
      subfields: [
        { id: 'sms_opt_in.phone', type: 'phone', label: 'Phone number', required: true },
        {
          id: 'sms_opt_in.consent',
          type: 'select',
          label: 'Can we text you updates?',
          disclosure: 'Message and data rates may apply.',
          required: true,
          options: [
            { value: 'yes', label: 'Yes, text me' },
            { value: 'no', label: 'No thanks' },
          ],
        },
      ],
    };

    test('renders the phone input plus the consent toggle as Hairline menu rows', () => {
      render(<CompositeFieldGroup field={phoneConsentField} onSubmit={jest.fn()} inputRef={{ current: null }} labelId="label-sms_opt_in" />);

      expect(screen.getByLabelText(/Phone number/)).toHaveClass('hairline-composite-input');
      expect(screen.getByText('Message and data rates may apply.')).toHaveClass('hairline-composite-hint');

      const menu = document.querySelector('.hairline-form-menu');
      expect(menu).toBeInTheDocument();
      const rows = screen.getAllByRole('button', { name: /Yes, text me|No thanks/ });
      expect(rows).toHaveLength(2);
      rows.forEach((row) => {
        expect(row).toHaveClass('hairline-form-menu-row');
        expect(row).toHaveAttribute('aria-pressed', 'false');
      });
    });

    test('consent toggle is mutually exclusive and marks the selected row', () => {
      render(<CompositeFieldGroup field={phoneConsentField} onSubmit={jest.fn()} inputRef={{ current: null }} labelId="label-sms_opt_in" />);

      const yesRow = screen.getByRole('button', { name: 'Yes, text me' });
      const noRow = screen.getByRole('button', { name: 'No thanks' });

      fireEvent.click(yesRow);
      expect(yesRow).toHaveAttribute('aria-pressed', 'true');
      expect(yesRow).toHaveClass('hairline-form-menu-row--selected');
      expect(noRow).toHaveAttribute('aria-pressed', 'false');

      fireEvent.click(noRow);
      expect(noRow).toHaveAttribute('aria-pressed', 'true');
      expect(yesRow).toHaveAttribute('aria-pressed', 'false');
      expect(yesRow).not.toHaveClass('hairline-form-menu-row--selected');
    });

    test('a too-short phone number blocks submit with the phone-specific error (frozen validateField)', () => {
      const onSubmit = jest.fn();
      render(<CompositeFieldGroup field={phoneConsentField} onSubmit={onSubmit} inputRef={{ current: null }} labelId="label-sms_opt_in" />);

      fireEvent.change(screen.getByLabelText(/Phone number/), { target: { value: '555' } });
      fireEvent.click(screen.getByRole('button', { name: 'Yes, text me' }));
      fireEvent.submit(screen.getByLabelText(/Phone number/).closest('form'));

      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByText('Phone number must have at least 7 digits')).toBeInTheDocument();
      expect(screen.getByLabelText(/Phone number/)).toHaveClass('hairline-composite-input--error');
    });

    test('submits phone + consent selection together, validation skipped for the select subfield', () => {
      const onSubmit = jest.fn();
      render(<CompositeFieldGroup field={phoneConsentField} onSubmit={onSubmit} inputRef={{ current: null }} labelId="label-sms_opt_in" />);

      fireEvent.change(screen.getByLabelText(/Phone number/), { target: { value: '512-555-0100' } });
      fireEvent.click(screen.getByRole('button', { name: 'Yes, text me' }));
      fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

      expect(onSubmit).toHaveBeenCalledWith({
        'sms_opt_in.phone': '512-555-0100',
        'sms_opt_in.consent': 'yes',
      });
    });
  });
});
