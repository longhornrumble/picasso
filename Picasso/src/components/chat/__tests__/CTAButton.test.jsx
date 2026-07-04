/**
 * CTAButton Component Tests
 * Tests for Context-Based CTA Styling (_position metadata)
 *
 * Hairline W2.7b: the plain default `CTAButton` export was restyled from
 * the old `.cta-button`/`.cta-primary`/`.cta-secondary` pill classes to
 * `.hairline-cta`/`.hairline-cta--primary`/`.hairline-cta--secondary`
 * (forms submit/cancel vocabulary — see CTAButton.jsx's header comment).
 * These tests assert the restyled classNames; the click-dispatch contract
 * (onClick called with the untouched cta object, `_position`/action-based
 * styling selection) is unchanged and re-verified below alongside the
 * restyle. `CTAButtonGroup` assertions further down are untouched (W2.7,
 * separate ownership).
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CTAButton, { CTAButtonGroup } from '../CTAButton';

describe('CTAButton - Context-Based CTA Styling', () => {
  describe('Position Metadata Styling', () => {
    test('renders with hairline-cta--primary class when _position is "primary"', () => {
      const cta = {
        _position: 'primary',
        label: 'Apply Now',
        action: 'start_form',
      };

      render(<CTAButton cta={cta} />);
      const button = screen.getByRole('button', { name: /apply now/i });

      expect(button).toHaveClass('hairline-cta');
      expect(button).toHaveClass('hairline-cta--primary');
      expect(button).not.toHaveClass('hairline-cta--secondary');
    });

    test('renders with hairline-cta--secondary class when _position is "secondary"', () => {
      const cta = {
        _position: 'secondary',
        label: 'Learn More',
        action: 'navigate',
      };

      render(<CTAButton cta={cta} />);
      const button = screen.getByRole('button', { name: /learn more/i });

      expect(button).toHaveClass('hairline-cta');
      expect(button).toHaveClass('hairline-cta--secondary');
      expect(button).not.toHaveClass('hairline-cta--primary');
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
      expect(button).toHaveClass('hairline-cta--secondary');
      expect(button).not.toHaveClass('hairline-cta--primary');
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
      expect(button).toHaveClass('hairline-cta--primary');
    });

    test('uses hairline-cta--secondary for navigate actions without _position', () => {
      const navCta = {
        label: 'Read More',
        action: 'navigate',
      };

      render(<CTAButton cta={navCta} />);
      const button = screen.getByRole('button', { name: /read more/i });

      expect(button).toHaveClass('hairline-cta--secondary');
    });

    test('defaults to hairline-cta--secondary for unknown actions', () => {
      const unknownCta = {
        label: 'Unknown Action',
        action: 'custom_action',
      };

      render(<CTAButton cta={unknownCta} />);
      const button = screen.getByRole('button', { name: /unknown action/i });

      expect(button).toHaveClass('hairline-cta--secondary');
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

      expect(button).toHaveClass('hairline-cta--primary');
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

      expect(button).toHaveClass('hairline-cta--secondary');
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
      expect(button).toHaveClass('hairline-cta--primary');
      expect(button).not.toHaveClass('hairline-cta--secondary');
    });
  });
});

// W2.7: CTAButtonGroup now renders the DESIGN_SPEC.md "Suggestion card"
// menu-anatomy (a bordered `.hairline-suggestion-card` of
// `.hairline-suggestion-row` buttons) instead of the old pill-button row.
// These tests assert the restyled markup/classes; the click-dispatch
// contract (onCtaClick called with the untouched cta object) is unchanged
// and re-verified below alongside the restyle.
describe('CTAButtonGroup', () => {
  describe('Row rendering — menu-card anatomy (W2.7)', () => {
    test('renders a bordered suggestion card with one row per cta', () => {
      const ctas = [
        { _position: 'primary', label: 'Primary CTA', action: 'start_form', id: 'cta1' },
        { _position: 'secondary', label: 'Secondary CTA 1', action: 'navigate', id: 'cta2' },
        { _position: 'secondary', label: 'Secondary CTA 2', action: 'navigate', id: 'cta3' },
      ];

      const { container } = render(<CTAButtonGroup ctas={ctas} />);

      const card = container.querySelector('.hairline-suggestion-card');
      expect(card).toBeInTheDocument();
      expect(card).toHaveAttribute('role', 'group');
      expect(card.querySelectorAll('.hairline-suggestion-row')).toHaveLength(3);
    });

    test('every row rests identical — no emphasized class even for _position primary (spec amendment 7)', () => {
      // The mock's tint-filled primary row read as a hover/selected state
      // (Chris, 2026-07-04) — retired. _position stays dispatch metadata only.
      const ctas = [
        { _position: 'primary', label: 'Primary CTA', action: 'start_form', id: 'cta1' },
        { _position: 'secondary', label: 'Secondary CTA', action: 'navigate', id: 'cta2' },
        { label: 'No Position CTA', action: 'navigate', id: 'cta3' },
      ];

      render(<CTAButtonGroup ctas={ctas} />);

      for (const name of [/primary cta/i, /secondary cta/i, /no position cta/i]) {
        const row = screen.getByRole('button', { name });
        expect(row).toHaveClass('hairline-suggestion-row');
        expect(row.className).toBe('hairline-suggestion-row');
      }
    });

    test('row renders a label span and an aria-hidden arrow span', () => {
      const ctas = [{ label: 'Learn about mentoring', action: 'navigate', id: 'cta1' }];

      const { container } = render(<CTAButtonGroup ctas={ctas} />);

      const row = screen.getByRole('button', { name: /learn about mentoring/i });
      const label = row.querySelector('.hairline-suggestion-row-label');
      const arrow = row.querySelector('.hairline-suggestion-row-arrow');

      expect(label).toHaveTextContent('Learn about mentoring');
      expect(arrow).toHaveAttribute('aria-hidden', 'true');
    });

    test('renders null when ctas array is empty', () => {
      const { container } = render(<CTAButtonGroup ctas={[]} />);
      expect(container.firstChild).toBeNull();
    });

    test('renders null when ctas is not provided', () => {
      const { container } = render(<CTAButtonGroup />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('Click dispatch (frozen contract)', () => {
    test('passes onClick handler to all rows with the untouched cta object', () => {
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

    test('all rows disabled when group is disabled (but the card still renders)', () => {
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

  // W2.7 / DESIGN_SPEC.md screen 3: "suggestions ... disappear once used" —
  // HAIRLINE_WORKPLAN.md W2.7 explicitly sanctions replacing the pre-Hairline
  // "disable all buttons in the message after any click" *styling* with a
  // "remove the card" *styling*. This supersedes the old disabled-buttons
  // assertion (this is the intended design per the workplan, not a silently
  // dropped behavioral assertion).
  describe('Disappears once used (W2.7)', () => {
    test('the entire card is removed once any cta in the group has been clicked', () => {
      const clickedIds = new Set(['cta1']);
      const ctas = [
        { _position: 'primary', label: 'Clicked Button', action: 'start_form', id: 'cta1' },
        { _position: 'secondary', label: 'Not Clicked', action: 'navigate', id: 'cta2' },
      ];

      const { container } = render(<CTAButtonGroup ctas={ctas} clickedButtonIds={clickedIds} />);

      expect(container.firstChild).toBeNull();
      expect(screen.queryByRole('button', { name: /clicked button/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /not clicked/i })).not.toBeInTheDocument();
    });

    test('renders normally when clickedButtonIds is empty', () => {
      const ctas = [{ label: 'Button 1', action: 'start_form', id: 'cta1' }];

      render(<CTAButtonGroup ctas={ctas} clickedButtonIds={new Set()} />);

      expect(screen.getByRole('button', { name: /button 1/i })).toBeInTheDocument();
    });
  });
});
