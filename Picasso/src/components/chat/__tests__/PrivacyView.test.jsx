/**
 * PrivacyView Component Tests — Hairline privacy & compliance page (W3.4)
 *
 * DESIGN_SPEC.md "6. Privacy & compliance": one bordered checklist card (3
 * fixed compliance facts) + one paragraph of fine print linking to the
 * tenant's `privacy_notice_url`.
 *
 * The absent-field fixture below is the REQUIRED forward-compatible-reads
 * test (CLAUDE.md's Schema Discipline rule): `privacy_notice_url` is a
 * net-new config field that doesn't exist on any tenant config yet, so this
 * component must render cleanly — without the link — against every
 * old-shape config in production today.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import PrivacyView from '../PrivacyView';

const mockUseConfig = jest.fn();
jest.mock('../../../hooks/useConfig', () => ({
  useConfig: (...args) => mockUseConfig(...args),
}));

function setConfig(config) {
  mockUseConfig.mockReturnValue({ config });
}

beforeEach(() => {
  mockUseConfig.mockReset();
});

describe('PrivacyView — checklist + header (DESIGN_SPEC.md screen 6)', () => {
  it('renders the page title', () => {
    setConfig({});
    render(<PrivacyView onBack={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getByText('Privacy & compliance')).toBeInTheDocument();
  });

  it('renders the three checklist rows, in order, from strings.privacy.checklist', () => {
    setConfig({});
    render(<PrivacyView onBack={jest.fn()} onClose={jest.fn()} />);

    const rows = screen.getAllByText(
      /All data is encrypted in transit|Audit logging for compliance|Retention varies by data type/
    );
    expect(rows.map((el) => el.textContent)).toEqual([
      'All data is encrypted in transit',
      'Audit logging for compliance',
      'Retention varies by data type',
    ]);
  });

  it('has dialog ARIA semantics', () => {
    setConfig({});
    render(<PrivacyView onBack={jest.fn()} onClose={jest.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Privacy & compliance' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });
});

describe('PrivacyView — tenant policy link (NEW config read, D9)', () => {
  it('renders the fine print with a "privacy notice" link to config.privacy_notice_url when present', () => {
    setConfig({ privacy_notice_url: 'https://example.org/privacy' });
    render(<PrivacyView onBack={jest.fn()} onClose={jest.fn()} />);

    const link = screen.getByRole('link', { name: 'privacy notice' });
    expect(link).toHaveAttribute('href', 'https://example.org/privacy');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(
      screen.getByText(/Your conversation is stored only in this browser/)
    ).toBeInTheDocument();
    expect(screen.getByText(/for retention details/)).toBeInTheDocument();
  });

  it('REQUIRED forward-compatible-reads fixture: renders without the link and without errors when privacy_notice_url is absent (old-shape config)', () => {
    // Every tenant config in production today lacks this net-new field.
    setConfig({ chat_title: 'Test Tenant' });
    expect(() => render(<PrivacyView onBack={jest.fn()} onClose={jest.fn()} />)).not.toThrow();

    expect(screen.queryByRole('link', { name: 'privacy notice' })).not.toBeInTheDocument();
    // The storage disclosure renders even without the URL (Chris,
    // 2026-07-03) — only the notice sentence with its link is conditional.
    expect(
      screen.getByText(/Your conversation is stored only in this browser/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/for retention details/)).not.toBeInTheDocument();
    // The checklist still renders — the page stands on its own without the link.
    expect(screen.getByText('All data is encrypted in transit')).toBeInTheDocument();
  });

  it('tolerates config being null (pre-fetch state)', () => {
    setConfig(null);
    expect(() => render(<PrivacyView onBack={jest.fn()} onClose={jest.fn()} />)).not.toThrow();
    expect(screen.getByText('Privacy & compliance')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'privacy notice' })).not.toBeInTheDocument();
  });

  it('tolerates an empty-string privacy_notice_url (falsy) the same as absent', () => {
    setConfig({ privacy_notice_url: '' });
    render(<PrivacyView onBack={jest.fn()} onClose={jest.fn()} />);
    expect(screen.queryByRole('link', { name: 'privacy notice' })).not.toBeInTheDocument();
  });
});

describe('PrivacyView — navigation affordances', () => {
  beforeEach(() => {
    setConfig({});
  });

  it('back chevron calls onBack', () => {
    const onBack = jest.fn();
    render(<PrivacyView onBack={onBack} onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /back to settings/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('close (X) calls onClose', () => {
    const onClose = jest.fn();
    render(<PrivacyView onBack={jest.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close chat/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape key calls onBack (a11y — HAIRLINE_WORKPLAN.md ground rule #7)', () => {
    const onBack = jest.fn();
    render(<PrivacyView onBack={onBack} onClose={jest.fn()} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('focus moves into the takeover on mount (back button)', () => {
    render(<PrivacyView onBack={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getByRole('button', { name: /back to settings/i })).toHaveFocus();
  });
});
