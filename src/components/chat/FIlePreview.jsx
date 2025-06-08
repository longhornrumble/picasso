// src/components/chat/FilePreview.jsx
import React from "react";
import { FileText, Image, Video, Music, Archive, File, X } from "lucide-react";

export default function FilePreview({ file, uploadState = "complete", onCancel }) {
  // Helper function to check if file is an image
  const isImage = file?.type?.startsWith('image/');

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
        return 'Uploading...';
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

  // Helper function to get styling based on upload state
  const getStateStyle = () => {
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

  return (
    <div style={{ marginTop: '8px' }}>
      {/* Image Preview */}
      {isImage && uploadState === 'complete' ? (
        <div style={{
          width: '200px',
          height: '150px',
          borderRadius: '8px',
          overflow: 'hidden',
          border: '1px solid #e5e7eb',
          backgroundColor: '#f3f4f6',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative'
        }}>
          {file.preview ? (
            <img 
              src={file.preview} 
              alt={file.name}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover'
              }}
            />
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              color: '#6b7280',
              fontSize: '12px'
            }}>
              <Image size={24} style={{ marginBottom: '4px' }} />
              {file.name}
            </div>
          )}
        </div>
      ) : (
        /* File Card */
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px',
          border: '1px solid',
          borderRadius: '8px',
          maxWidth: '280px',
          position: 'relative',
          ...getStateStyle()
        }}>
          {/* Cancel button for uploading files */}
          {uploadState === 'uploading' && onCancel && (
            <button
              onClick={onCancel}
              style={{
                position: 'absolute',
                top: '4px',
                right: '4px',
                background: '#ef4444',
                border: 'none',
                borderRadius: '50%',
                width: '20px',
                height: '20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white'
              }}
            >
              <X size={12} />
            </button>
          )}

          {/* File Icon */}
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            backgroundColor: uploadState === 'error' ? '#ef4444' : '#3b82f6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '10px',
            fontWeight: '600',
            flexShrink: 0
          }}>
            {uploadState === 'error' ? '✗' : getFileTypeLabel(file.type)}
          </div>

          {/* File Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: '13px',
              fontWeight: '500',
              color: uploadState === 'error' ? '#dc2626' : '#374151',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {file.name}
            </div>
            <div style={{
              fontSize: '11px',
              color: uploadState === 'error' ? '#dc2626' : '#6b7280',
              marginTop: '2px'
            }}>
              {getStatusText()}
            </div>

            {/* Progress Bar for Uploading */}
            {uploadState === 'uploading' && (
              <div style={{
                width: '100%',
                height: '4px',
                backgroundColor: '#e5e7eb',
                borderRadius: '2px',
                marginTop: '4px',
                overflow: 'hidden'
              }}>
                <div style={{
                  height: '100%',
                  backgroundColor: '#3b82f6',
                  borderRadius: '2px',
                  width: '65%',
                  transition: 'width 0.3s ease'
                }} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}