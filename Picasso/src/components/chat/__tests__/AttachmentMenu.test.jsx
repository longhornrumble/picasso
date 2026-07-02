/**
 * AttachmentMenu Component Tests — Hairline attach popover (W2.5)
 *
 * Covers the restyled 2-row popover (DESIGN_SPEC.md "Attach menu") AND the
 * frozen behavioral contract that must survive the re-skin: feature-flag
 * gating (the 4 old buttons collapsed into 2 rows without changing who
 * sees what), the immediate addMessage-on-select wiring, and the new
 * ESC/outside-tap dismiss required for any new overlay.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import AttachmentMenu from '../AttachmentMenu';
import { useChat } from '../../../hooks/useChat';
import { useConfig } from '../../../hooks/useConfig';

jest.mock('../../../hooks/useChat', () => ({
  useChat: jest.fn(),
}));

jest.mock('../../../hooks/useConfig', () => ({
  useConfig: jest.fn(),
}));

const configWithFeatures = (features = {}) => ({ config: { features } });

// Drives the hidden <input type="file"> that AttachmentMenu creates
// imperatively: intercepts .click() so no real file dialog opens, stamps a
// fake FileList, and fires the change handler synchronously.
function stubFilePicker(files) {
  return jest.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function pick() {
    Object.defineProperty(this, 'files', { value: files, configurable: true });
    this.onchange({ target: this });
  });
}

beforeAll(() => {
  if (!global.URL.createObjectURL) {
    global.URL.createObjectURL = jest.fn();
  }
});

beforeEach(() => {
  jest.spyOn(global.URL, 'createObjectURL').mockReturnValue('blob:mock-url');
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('AttachmentMenu — Hairline attach popover', () => {
  describe('feature-flag gating (frozen semantics, 4→2 grouping)', () => {
    test('renders nothing when neither uploads nor photo_uploads is enabled', () => {
      useConfig.mockReturnValue(configWithFeatures());
      useChat.mockReturnValue({ addMessage: jest.fn() });
      const { container } = render(<AttachmentMenu onClose={jest.fn()} />);
      expect(container).toBeEmptyDOMElement();
    });

    test('shows only "Photo or video" when photo_uploads is enabled (uploads disabled)', () => {
      useConfig.mockReturnValue(configWithFeatures({ photo_uploads: true }));
      useChat.mockReturnValue({ addMessage: jest.fn() });
      render(<AttachmentMenu onClose={jest.fn()} />);

      expect(screen.getByRole('menuitem', { name: 'Photo or video' })).toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: 'File' })).not.toBeInTheDocument();
    });

    test('shows only "File" when uploads is enabled (photo_uploads disabled)', () => {
      useConfig.mockReturnValue(configWithFeatures({ uploads: true }));
      useChat.mockReturnValue({ addMessage: jest.fn() });
      render(<AttachmentMenu onClose={jest.fn()} />);

      expect(screen.getByRole('menuitem', { name: 'File' })).toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: 'Photo or video' })).not.toBeInTheDocument();
    });

    test('shows both rows when both flags are enabled', () => {
      useConfig.mockReturnValue(configWithFeatures({ uploads: true, photo_uploads: true }));
      useChat.mockReturnValue({ addMessage: jest.fn() });
      render(<AttachmentMenu onClose={jest.fn()} />);

      expect(screen.getByRole('menuitem', { name: 'Photo or video' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'File' })).toBeInTheDocument();
    });
  });

  describe('selection wiring (frozen behavior)', () => {
    test('picking a file via "File" posts it immediately and closes the popover', () => {
      useConfig.mockReturnValue(configWithFeatures({ uploads: true }));
      const addMessage = jest.fn();
      useChat.mockReturnValue({ addMessage });
      const onClose = jest.fn();
      const file = new File(['contents'], 'report.pdf', { type: 'application/pdf' });
      const clickSpy = stubFilePicker([file]);

      render(<AttachmentMenu onClose={onClose} />);
      fireEvent.click(screen.getByRole('menuitem', { name: 'File' }));

      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'user',
          files: [expect.objectContaining({ name: 'report.pdf', type: 'application/pdf' })],
        })
      );
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('the "File" row accepts any file type (accept="*/*")', () => {
      useConfig.mockReturnValue(configWithFeatures({ uploads: true }));
      useChat.mockReturnValue({ addMessage: jest.fn() });
      let capturedAccept;
      jest.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function capture() {
        capturedAccept = this.accept;
      });

      render(<AttachmentMenu onClose={jest.fn()} />);
      fireEvent.click(screen.getByRole('menuitem', { name: 'File' }));

      expect(capturedAccept).toBe('*/*');
    });

    test('the "Photo or video" row accepts images and video (consolidated capability)', () => {
      useConfig.mockReturnValue(configWithFeatures({ photo_uploads: true }));
      useChat.mockReturnValue({ addMessage: jest.fn() });
      let capturedAccept;
      jest.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function capture() {
        capturedAccept = this.accept;
      });

      render(<AttachmentMenu onClose={jest.fn()} />);
      fireEvent.click(screen.getByRole('menuitem', { name: 'Photo or video' }));

      expect(capturedAccept).toBe('image/*,video/*');
    });

    test('does not call addMessage when the file picker is cancelled (no files selected)', () => {
      useConfig.mockReturnValue(configWithFeatures({ uploads: true }));
      const addMessage = jest.fn();
      useChat.mockReturnValue({ addMessage });
      stubFilePicker([]);

      render(<AttachmentMenu onClose={jest.fn()} />);
      fireEvent.click(screen.getByRole('menuitem', { name: 'File' }));

      expect(addMessage).not.toHaveBeenCalled();
    });
  });

  describe('dismissal (new-overlay a11y requirement)', () => {
    beforeEach(() => {
      useConfig.mockReturnValue(configWithFeatures({ uploads: true, photo_uploads: true }));
      useChat.mockReturnValue({ addMessage: jest.fn() });
    });

    test('Escape dismisses the popover', () => {
      const onClose = jest.fn();
      render(<AttachmentMenu onClose={onClose} />);

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('a tap outside the popover dismisses it', () => {
      const onClose = jest.fn();
      render(
        <div>
          <div data-testid="outside">outside</div>
          <AttachmentMenu onClose={onClose} />
        </div>
      );

      fireEvent.mouseDown(screen.getByTestId('outside'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('a tap inside the popover does not dismiss it', () => {
      const onClose = jest.fn();
      render(<AttachmentMenu onClose={onClose} />);

      fireEvent.mouseDown(screen.getByRole('menu'));
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
