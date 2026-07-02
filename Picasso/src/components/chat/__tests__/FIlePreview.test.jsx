/**
 * FilePreview Component Tests — Hairline attachment chip (W2.5)
 *
 * Scope: only the "attachment chip" branch (uploading / error / any
 * complete-but-non-previewable file) is restyled by W2.5 — see
 * FIlePreview.jsx's header comment. The image/video/PDF inline-preview
 * branches are W4.4's scope; this suite asserts they are left untouched
 * (old classnames) as a boundary regression check, without asserting their
 * internal styling.
 *
 * NOTE: filename intentionally matches the source file's unusual
 * capitalization (`FIlePreview.jsx`) — see docs/HAIRLINE_WORKPLAN.md W2.5.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import FilePreview from '../FIlePreview';

// Non-previewable file type — exercises the chip branch in the "complete"
// state (image/video/pdf all have their own rich-preview branch instead;
// see the boundary tests below).
const docFile = { name: 'report.docx', type: 'application/msword', size: 2516582 };
const pdfFile = { name: 'report.pdf', type: 'application/pdf', size: 2516582, url: 'blob:mock' };
const imageFile = { name: 'IMG_2043.jpg', type: 'image/jpeg', size: 2516582, url: 'blob:mock' };
const videoFile = { name: 'clip.mp4', type: 'video/mp4', url: 'blob:mock' };

describe('FilePreview — Hairline attachment chip', () => {
  describe('chip form (W2.5 scope)', () => {
    test('complete, non-previewable file renders the chip with size + "ready to send"', () => {
      render(<FilePreview file={docFile} uploadState="complete" />);

      expect(screen.getByText('report.docx')).toBeInTheDocument();
      expect(screen.getByText('2.4 MB · ready to send')).toBeInTheDocument();
      expect(document.querySelector('.hairline-attachment-chip--complete')).toBeInTheDocument();
    });

    test('uploading state shows progress status and a progress bar', () => {
      const uploadingFile = { ...pdfFile, progress: 42 };
      render(<FilePreview file={uploadingFile} uploadState="uploading" />);

      expect(screen.getByText('Uploading… 42%')).toBeInTheDocument();
      expect(document.querySelector('.hairline-attachment-chip-progress')).toBeInTheDocument();
      expect(document.querySelector('.hairline-attachment-chip--uploading')).toBeInTheDocument();
    });

    test('error state shows "Upload failed" and the error modifier class', () => {
      render(<FilePreview file={pdfFile} uploadState="error" />);

      expect(screen.getByText('Upload failed')).toBeInTheDocument();
      expect(document.querySelector('.hairline-attachment-chip--error')).toBeInTheDocument();
    });

    test('renders a remove control when onCancel is supplied, and it fires onCancel', () => {
      const onCancel = jest.fn();
      render(<FilePreview file={pdfFile} uploadState="uploading" onCancel={onCancel} />);

      const removeButton = screen.getByRole('button', { name: 'Remove report.pdf' });
      fireEvent.click(removeButton);
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    test('does not render a remove control when onCancel is not supplied (no behavior change)', () => {
      render(<FilePreview file={docFile} uploadState="complete" />);
      expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();
    });

    test('a file with no size still shows "ready to send"', () => {
      render(<FilePreview file={{ name: 'note.txt', type: 'text/plain' }} uploadState="complete" />);
      expect(screen.getByText('ready to send')).toBeInTheDocument();
    });
  });

  describe('in-thread preview boundary (W4.4 scope — left untouched)', () => {
    test('a complete image still renders via the old rich inline-preview branch, not the chip', () => {
      render(<FilePreview file={imageFile} uploadState="complete" />);

      expect(document.querySelector('.image-preview')).toBeInTheDocument();
      expect(document.querySelector('.hairline-attachment-chip')).not.toBeInTheDocument();
      expect(screen.getByAltText('IMG_2043.jpg')).toHaveAttribute('src', 'blob:mock');
    });

    test('a complete video still renders via the old rich inline-preview branch, not the chip', () => {
      render(<FilePreview file={videoFile} uploadState="complete" />);

      expect(document.querySelector('.video-preview')).toBeInTheDocument();
      expect(document.querySelector('.hairline-attachment-chip')).not.toBeInTheDocument();
    });

    test('an uploading image renders the chip, not the rich preview (no url/complete state yet)', () => {
      render(<FilePreview file={{ ...imageFile, url: undefined }} uploadState="uploading" />);

      expect(document.querySelector('.hairline-attachment-chip')).toBeInTheDocument();
      expect(document.querySelector('.image-preview')).not.toBeInTheDocument();
    });

    test('a complete PDF still renders via the old rich inline-preview branch, not the chip', () => {
      render(<FilePreview file={pdfFile} uploadState="complete" />);

      expect(document.querySelector('.pdf-preview')).toBeInTheDocument();
      expect(document.querySelector('.hairline-attachment-chip')).not.toBeInTheDocument();
    });

    test('an uploading (not-yet-complete) PDF renders the chip instead', () => {
      render(<FilePreview file={pdfFile} uploadState="uploading" />);

      expect(document.querySelector('.hairline-attachment-chip')).toBeInTheDocument();
      expect(document.querySelector('.pdf-preview')).not.toBeInTheDocument();
    });
  });
});
