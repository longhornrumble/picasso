import React from "react";
import { Camera, FilePlus, Image, Video } from "lucide-react";
import { useConfig } from "../../context/ConfigProvider";
import { useChat } from "../../context/ChatProvider";

export default function AttachmentMenu({ onClose }) {
  const { config } = useConfig();
  const features = config?.features || {};
  const { addMessage } = useChat();

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
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;

    // Accept file types based on button action
    if (button.action === "photo" || button.action === "camera") {
      input.accept = "image/*";
      if (button.action === "camera") {
        input.capture = "environment"; // or "user" for front-facing
      }
    } else if (button.action === "video") {
      input.accept = "video/*";
    } else {
      input.accept = "*/*";
    }

    input.onchange = () => {
      const selectedFiles = Array.from(input.files);
      if (!selectedFiles.length) return;

      const messageFiles = selectedFiles.map(file => ({
        name: file.name,
        type: file.type,
        url: URL.createObjectURL(file)
      }));

      addMessage({
        role: "user",
        content: `📎 Uploaded ${messageFiles.length > 1 ? 'files' : 'file'}`,
        files: messageFiles
      });

      if (onClose) onClose();
    };

    input.click();
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