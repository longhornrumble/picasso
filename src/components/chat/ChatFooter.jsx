// Enhanced ChatFooter.jsx with FollowUpPromptBar integration
import React, { useState } from "react";
import { useConfig } from "../../context/ConfigProvider";
import FollowUpPromptBar from "./FollowUpPromptBar";

export default function ChatFooter({ brandText = "AI" }) {
  const { config } = useConfig();
  const [logoError, setLogoError] = useState(false);
  
  // Get company logo from config
  const companyLogoUrl = config?.branding?.company_logo_url;
  const showLogo = companyLogoUrl && !logoError;
  
  const handleLogoError = () => {
    console.log('❌ Company logo failed to load:', companyLogoUrl);
    setLogoError(true);
  };

  const handleLogoLoad = () => {
    console.log('✅ Company logo loaded successfully:', companyLogoUrl);
    setLogoError(false);
  };

  return (
    <div className="chat-footer-container">
      {/* Quick Help Button - Above the logo */}
      <FollowUpPromptBar />
      
      {/* Powered By Section - Below the button */}
      <div className="chat-footer">
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
          Powered by{" "}
          
          {showLogo ? (
            // Show company logo if available
            <img 
              src={companyLogoUrl}
              onError={handleLogoError}
              onLoad={handleLogoLoad}
              alt={brandText}
              style={{
                height: '16px',
                maxWidth: '80px',
                objectFit: 'contain',
                marginLeft: '4px'
              }}
            />
          ) : (
            // Fallback to text
            <span style={{
              backgroundColor: "#000",
              color: "white", 
              padding: "2px 6px",
              borderRadius: "3px",
              fontSize: "10px",
              fontWeight: "500",
              marginLeft: "4px"
            }}>
              {brandText}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}