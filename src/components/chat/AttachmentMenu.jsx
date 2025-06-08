import React from "react";
import { Camera, FilePlus, Image, Video } from "lucide-react";
import { useConfig } from "../../context/ConfigProvider";

export default function AttachmentMenu({ onClose }) {
  const { config } = useConfig();
  const features = config?.features || {};

  // Define all possible buttons with their feature requirements
  const allButtons = [
    {
      id: 'file',
      label: "Upload file", 
      icon: <FilePlus className="w-5 h-5" />,
      enabled: features.uploads, // Use uploads feature toggle
      action: 'file'
    },
    {
      id: 'camera',
      label: "Take photo", 
      icon: <Camera className="w-5 h-5" />,
      enabled: features.photo_uploads, // Use photo_uploads feature toggle
      action: 'camera'
    },
    {
      id: 'photo',
      label: "Upload photo", 
      icon: <Image className="w-5 h-5" />,
      enabled: features.photo_uploads, // Use photo_uploads feature toggle
      action: 'photo'
    },
    {
      id: 'video',
      label: "Upload video", 
      icon: <Video className="w-5 h-5" />,
      enabled: features.photo_uploads, // Use photo_uploads feature toggle
      action: 'video'
    }
  ];

  // Filter to only enabled buttons
  const availableButtons = allButtons.filter(button => button.enabled);

  // Don't render menu if no buttons are available
  if (availableButtons.length === 0) {
    return null;
  }

  const handleButtonClick = (button) => {
    console.log(`Trigger: ${button.label} (${button.action})`);
    
    // Here you can add specific logic for each action type
    switch (button.action) {
      case 'file':
        // Handle file upload
        break;
      case 'camera':
        // Handle camera capture
        break;
      case 'photo':
        // Handle photo upload
        break;
      case 'video':
        // Handle video upload
        break;
      default:
        console.log(`Unknown action: ${button.action}`);
    }
    
    if (onClose) onClose();
  };

  return (
    <div className="upload-menu">
      <div className="upload-menu-header">
        <span className="upload-menu-title">Add attachment</span>
        <button onClick={onClose} className="upload-menu-close">
          ×
        </button>
      </div>
      <div className="upload-menu-grid">
        {availableButtons.map((button) => (
          <button
            key={button.id}
            onClick={() => handleButtonClick(button)}
            className="upload-option"
            aria-label={button.label}
            data-type={button.id}
          >
            {button.icon}
            <span>{button.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}