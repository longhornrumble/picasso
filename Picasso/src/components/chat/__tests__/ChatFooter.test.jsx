/**
 * ChatFooter Component Tests — Hairline redesign (W6.3 audit fix F2).
 *
 * DESIGN_SPEC.md Typography "Powered-by" row: "Powered by [16px MyRecruiter
 * icon] MyRecruiter" — fixed platform attribution, never tenant-configurable,
 * copy from src/i18n/strings.js, mark from the BUNDLED asset (no S3 hotlink).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import ChatFooter from '../ChatFooter';
import strings from '../../../i18n/strings';

describe('ChatFooter — Hairline powered-by line (W6.3 F2)', () => {
  test('renders the strings-module copy: prefix + brand name', () => {
    render(<ChatFooter />);
    expect(screen.getByText(strings.footer.poweredByPrefix)).toHaveClass('hairline-footer-powered');
    expect(screen.getByText(strings.footer.brandName)).toHaveClass('hairline-footer-brand');
  });

  test('renders the bundled mark (root-relative, not an S3 hotlink) as decorative', () => {
    const { container } = render(<ChatFooter />);
    const mark = container.querySelector('.hairline-footer-mark');
    expect(mark).not.toBeNull();
    expect(mark.getAttribute('src')).toBe('/myrecruiter-mark.png');
    expect(mark.getAttribute('src')).not.toMatch(/^https?:/);
    // Decorative image: empty alt + aria-hidden so AT reads only the text.
    expect(mark.getAttribute('alt')).toBe('');
    expect(mark.getAttribute('aria-hidden')).toBe('true');
  });

  test('the brand name is real text, so a failed image load degrades gracefully', () => {
    render(<ChatFooter />);
    // No onError/fallback JS — the guarantee is structural: the name is text.
    expect(screen.getByText('MyRecruiter').tagName).toBe('SPAN');
  });
});
