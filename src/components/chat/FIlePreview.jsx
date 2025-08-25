// src/components/chat/FilePreview.jsx
import React from "react";
import { FileText, Image, Video, Music, Archive, File, X } from "lucide-react";

export default function FilePreview({ file, uploadState = "complete", onCancel }) {
  // Helper function to check if file is an image
  const isImage = file?.type && typeof file.type === 'string' && file.type.startsWith('image/');

  // Helper function to get file type label for icon
  const getFileTypeLabel = (mimeType) => {
    if (!mimeType) return 'FILE';
    
    if (mimeType.startsWith('image/')) return 'IMG';
    if (mimeType.startsWith('video/')) return 'VID';
    if (mimeType.startsWith('audio/')) return 'AUD';
    if (mimeType.includes('pdf')) return 'PDF';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'DOC';
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'XLS';
    if (mimeType.includes('text')) return 'TXT';
    if (mimeType.includes('zip') || mimeType.includes('rar')) return 'ZIP';
    
    return 'FILE';
  };

  // Helper function to get status text based on upload state
  const getStatusText = () => {
    switch (uploadState) {
      case 'uploading':
        return file?.progress ? `Uploading... ${file.progress}%` : 'Uploading...';
      case 'error':
        return 'Upload failed';
      case 'complete':
        return file?.size ? formatFileSize(file.size) : 'Ready';
      default:
        return 'Ready';
    }
  };

  // Helper function to format file size
  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return Math.round(bytes / (1024 * 1024)) + ' MB';
  };

  // Helper function to get styling based on upload state (currently unused)
  const _getStateStyle = () => {
    switch (uploadState) {
      case 'uploading':
        return {
          borderColor: '#3b82f6',
          backgroundColor: '#eff6ff'
        };
      case 'error':
        return {
          borderColor: '#ef4444',
          backgroundColor: '#fef2f2'
        };
      case 'complete':
      default:
        return {
          borderColor: '#e5e7eb',
          backgroundColor: '#ffffff'
        };
    }
  };

  const getFileCardClass = () => {
    switch (uploadState) {
      case 'uploading':
        return 'file-card file-card-uploading';
      case 'error':
        return 'file-card file-card-error';
      case 'complete':
      default:
        return 'file-card file-card-complete';
    }
  };

  return (
    <div className="file-preview-container">
      {/* Image Preview */}
      {isImage && uploadState === 'complete' ? (
        <div className="image-preview">
          {file.url ? (
            <img 
              src={file.url} 
              alt={file.name}
            />
          ) : (
            <div className="file-preview-placeholder">
              <Image size={24} className="file-preview-placeholder-icon" />
              {file.name}
            </div>
          )}
        </div>
      ) : (file.type && typeof file.type === 'string' && file.type.startsWith('video/')) && uploadState === 'complete' ? (
        <div className="video-preview">
          <video 
            src={file.url} 
            controls
          />
        </div>
      ) : (file.type && typeof file.type === 'string' && file.type.includes('pdf')) && uploadState === 'complete' ? (
        <div className="pdf-preview">
          <iframe 
            src={file.url}
            title={file.name}
            onError={(e) => {
              e.target.outerHTML = `<div class="pdf-error-message">Unable to preview PDF. Please download the file instead.</div>`;
            }}
          />
        </div>
      ) : (
        /* File Card */
        <div className={getFileCardClass()}>
          {/* Cancel button for uploading files */}
          {uploadState === 'uploading' && onCancel && (
            <button
              onClick={onCancel}
              className="file-cancel-button"
            >
              <X size={12} />
            </button>
          )}

          {/* File Icon */}
          <div className={`file-icon ${uploadState === 'error' ? 'file-icon-error' : ''}`}>
            {uploadState === 'error' ? '✗' : getFileTypeLabel(file.type)}
          </div>

          {/* File Info */}
          <div className="file-info">
            <div className={`file-name ${uploadState === 'error' ? 'file-name-error' : ''}`}>
              {file.name}
            </div>
            <div className={`file-status ${uploadState === 'error' ? 'file-status-error' : ''}`}>
              {getStatusText()}
            </div>

            {/* Progress Bar for Uploading */}
            {uploadState === 'uploading' && (
              <div className="file-progress-bar">
                <div 
                  className="file-progress-fill"
                  style={{ '--progress-width': file.progress ? `${file.progress}%` : '10%' }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}