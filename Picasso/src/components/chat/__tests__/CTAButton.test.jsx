/**
 * CTAButton Component Tests
 * Tests for Context-Based CTA Styling (_position metadata)
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CTAButton, { CTAButtonGroup } from '../CTAButton';

describe('CTAButton - Context-Based CTA Styling', () => {
  describe('Position Metadata Styling', () => {
    test('renders with cta-primary class when _position is "primary"', () => {
      const cta = {
        _position: 'primary',
        label: 'Apply Now',
        action: 'start_form',
      };

      render(<CTAButton cta={cta} />);
      const button = screen.getByRole('button', { name: /apply now/i });

      expect(button).toHaveClass('cta-button');
      expect(button).toHaveClass('cta-primary');
      expect(button).not.toHaveClass('cta-secondary');
    });

    test('renders with cta-secondary class when _position is "secondary"', () => {
      const cta = {
        _position: 'secondary',
        label: 'Learn More',
        action: 'navigate',
      };

      render(<CTAButton cta={cta} />);
      const button = screen.getByRole('button', { name: /learn more/i });

      expect(button).toHaveClass('cta-button');
      expect(button).toHaveClass('cta-secondary');
      expect(button).not.toHaveClass('cta-primary');
    });

    test('does NOT use legacy style field when _position is present', () => {
      const cta = {
        _position: 'secondary',
        style: 'primary', // Legacy field should be ignored
        label: 'Test Button',
        action: 'navigate',
      };

      render(<CTAButton cta={cta} />);
      const button = screen.getByRole('button', { name: /test button/i });

      // Should use _position (secondary), not style (primary)
      expect(button).toHaveClass('cta-secondary');
      expect(button).not.toHaveClass('cta-primary');
    });
  });

  describe('Backward Compatibility - Fallback Styling', () => {
    test('falls back to action-based styling when _position is not present', () => {
      const formCta = {
        label: 'Submit Form',
        action: 'start_form',
      };

      render(<CTAButton cta={formCta} />);
      const button = screen.getByRole('button', { name: /submit form/i });

      // Should fallback to primary for form actions
      expect(button).toHaveClass('cta-primary');
    });

    test('uses cta-secondary for navigate actions without _position', () => {
      const navCta = {
        label: 'Read More',
        action: 'navigate',
      };

      render(<CTAButton cta={navCta} />);
      const button = screen.getByRole('button', { name: /read more/i });

      expect(button).toHaveClass('cta-secondary');
    });

    test('defaults to cta-secondary for unknown actions', () => {
      const unknownCta = {
        label: 'Unknown Action',
        action: 'custom_action',
      };

      render(<CTAButton cta={unknownCta} />);
      const button = screen.getByRole('button', { name: /unknown action/i });

      expect(button).toHaveClass('cta-secondary');
    });
  });

  describe('CTA Properties', () => {
    test('renders button with correct label from label field', () => {
      const cta = {
        _position: 'primary',
        label: 'Apply to Program',
        action: 'start_form',
      };

      render(<CTAButton cta={cta} />);
      expect(screen.getByRole('button', { name: /apply to program/i })).toBeInTheDocument();
    });

    test('renders button with correct label from text field (fallback)', () => {
      const cta = {
        _position: 'secondary',
        text: 'Contact Us',
        action: 'navigate',
      };

      render(<CTAButton cta={cta} />);
      expect(screen.getByRole('button', { name: /contact us/i })).toBeInTheDocument();
    });

    test('sets correct data attributes', () => {
      const cta = {
        _position: 'primary',
        label: 'Test CTA',
        action: 'start_form',
        type: 'form_cta',
      };

      render(<CTAButton cta={cta} />);
      const button = screen.getByRole('button', { name: /test cta/i });

      expect(button).toHaveAttribute('data-action', 'start_form');
      expect(button).toHaveAttribute('data-type', 'form_cta');
    });

    test('renders null when cta is not provided', () => {
      const { container } = render(<CTAButton cta={null} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('Click Handlers', () => {
    test('calls onClick handler when button is clicked', () => {
      const onClick = jest.fn();
      const cta = {
        _position: 'primary',
        label: 'Click Me',
        action: 'start_form',
        id: 'test-cta',
      };

      render(<CTAButton cta={cta} onClick={onClick} />);
      const button = screen.getByRole('button', { name: /click me/i });

      fireEvent.click(button);

      expect(onClick).toHaveBeenCalledTimes(1);
      expect(onClick).toHaveBeenCalledWith(cta);
    });

    test('does not call onClick when button is disabled', () => {
      const onClick = jest.fn();
      const cta = {
        _position: 'primary',
        label: 'Disabled Button',
        action: 'start_form',
      };

      render(<CTAButton cta={cta} onClick={onClick} disabled={true} />);
      const button = screen.getByRole('button', { name: /disabled button/i });

      fireEvent.click(button);

      expect(onClick).not.toHaveBeenCalled();
      expect(button).toBeDisabled();
    });

    test('does not call onClick when onClick is not provided', () => {
      const cta = {
        _position: 'primary',
        label: 'No Handler',
        action: 'start_form',
      };

      render(<CTAButton cta={cta} />);
      const button = screen.getByRole('button', { name: /no handler/i });

      // Should not throw error
      expect(() => fireEvent.click(button)).not.toThrow();
    });
  });

  describe('Integration: Position Metadata with Different Actions', () => {
    test('primary position with form_trigger action', () => {
      const cta = {
        _position: 'primary',
        label: 'Apply to Volunteer',
        action: 'form_trigger',
        formId: 'volunteer_apply',
      };

      render(<CTAButton cta={cta} />);
      const button = screen.getByRole('button', { name: /apply to volunteer/i });

      expect(button).toHaveClass('cta-primary');
    });

    test('secondary position with navigate action', () => {
      const cta = {
        _position: 'secondary',
        label: 'Read FAQ',
        action: 'navigate',
        route: '/faq',
      };

      render(<CTAButton cta={cta} />);
      const button = screen.getByRole('button', { name: /read faq/i });

      expect(button).toHaveClass('cta-secondary');
    });

    test('primary position overrides action-based styling', () => {
      const cta = {
        _position: 'primary',
        label: 'Important Link',
        action: 'navigate', // Would normally be secondary
      };

      render(<CTAButton cta={cta} />);
      const button = screen.getByRole('button', { name: /important link/i });

      // Position takes precedence over action
      expect(button).toHaveClass('cta-primary');
      expect(button).not.toHaveClass('cta-secondary');
    });
  });
});

describe('CTAButtonGroup', () => {
  describe('Multiple Buttons with Position Metadata', () => {
    test('renders multiple CTAs with correct position classes', () => {
      const ctas = [
        { _position: 'primary', label: 'Primary CTA', action: 'start_form', id: 'cta1' },
        { _position: 'secondary', label: 'Secondary CTA 1', action: 'navigate', id: 'cta2' },
        { _position: 'secondary', label: 'Secondary CTA 2', action: 'navigate', id: 'cta3' },
      ];

      render(<CTAButtonGroup ctas={ctas} />);

      const primaryButton = screen.getByRole('button', { name: /primary cta/i });
      const secondary1 = screen.getByRole('button', { name: /secondary cta 1/i });
      const secondary2 = screen.getByRole('button', { name: /secondary cta 2/i });

      expect(primaryButton).toHaveClass('cta-primary');
      expect(secondary1).toHaveClass('cta-secondary');
      expect(secondary2).toHaveClass('cta-secondary');
    });

    test('handles mixed position metadata and fallback styling', () => {
      const ctas = [
        { _position: 'primary', label: 'With Position', action: 'start_form', id: 'cta1' },
        { label: 'Without Position', action: 'navigate', id: 'cta2' },
      ];

      render(<CTAButtonGroup ctas={ctas} />);

      const withPosition = screen.getByRole('button', { name: /with position/i });
      const withoutPosition = screen.getByRole('button', { name: /without position/i });

      expect(withPosition).toHaveClass('cta-primary');
      expect(withoutPosition).toHaveClass('cta-secondary'); // Fallback
    });

    test('renders null when ctas array is empty', () => {
      const { container } = render(<CTAButtonGroup ctas={[]} />);
      expect(container.firstChild).toBeNull();
    });

    test('renders null when ctas is not provided', () => {
      const { container } = render(<CTAButtonGroup />);
      expect(container.firstChild).toBeNull();
    });

    test('passes onClick handler to all buttons', () => {
      const onClick = jest.fn();
      const ctas = [
        { _position: 'primary', label: 'Button 1', action: 'start_form', id: 'cta1' },
        { _position: 'secondary', label: 'Button 2', action: 'navigate', id: 'cta2' },
      ];

      render(<CTAButtonGroup ctas={ctas} onCtaClick={onClick} />);

      fireEvent.click(screen.getByRole('button', { name: /button 1/i }));
      expect(onClick).toHaveBeenCalledWith(ctas[0]);

      fireEvent.click(screen.getByRole('button', { name: /button 2/i }));
      expect(onClick).toHaveBeenCalledWith(ctas[1]);
    });

    test('disables clicked buttons when clickedButtonIds is provided', () => {
      const clickedIds = new Set(['cta1']);
      const ctas = [
        { _position: 'primary', label: 'Clicked Button', action: 'start_form', id: 'cta1' },
        { _position: 'secondary', label: 'Not Clicked', action: 'navigate', id: 'cta2' },
      ];

      render(<CTAButtonGroup ctas={ctas} clickedButtonIds={clickedIds} />);

      const clickedButton = screen.getByRole('button', { name: /clicked button/i });
      const notClickedButton = screen.getByRole('button', { name: /not clicked/i });

      expect(clickedButton).toBeDisabled();
      expect(notClickedButton).not.toBeDisabled();
    });

    test('all buttons disabled when group is disabled', () => {
      const ctas = [
        { _position: 'primary', label: 'Button 1', action: 'start_form', id: 'cta1' },
        { _position: 'secondary', label: 'Button 2', action: 'navigate', id: 'cta2' },
      ];

      render(<CTAButtonGroup ctas={ctas} disabled={true} />);

      const button1 = screen.getByRole('button', { name: /button 1/i });
      const button2 = screen.getByRole('button', { name: /button 2/i });

      expect(button1).toBeDisabled();
      expect(button2).toBeDisabled();
    });
  });
});
