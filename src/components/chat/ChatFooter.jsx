// Enhanced ChatFooter.jsx with MyRecruiter company logo
import React, { useState } from "react";
import { useConfig } from "../../hooks/useConfig";
import { config as environmentConfig } from '../../config/environment';
import FollowUpPromptBar from "./FollowUpPromptBar";

export default function ChatFooter({ brandText = "MyRecruiter" }) {
  const { config } = useConfig();
  const [logoError, setLogoError] = useState(false);
  
  // MyRecruiter company logo - this is YOUR company's logo that powers the platform
  const myRecruiterLogoUrl = config?.branding?.company_logo_url || `${environmentConfig.API_BASE_URL}/collateral/MyRecruiterLogo.png`;
  const showLogo = myRecruiterLogoUrl && !logoError;
  
  const handleLogoError = () => {
    console.log('❌ MyRecruiter logo failed to load:', myRecruiterLogoUrl);
    setLogoError(true);
  };

  const handleLogoLoad = () => {
    console.log('✅ MyRecruiter logo loaded successfully:', myRecruiterLogoUrl);
    setLogoError(false);
  };

  return (
    <div className="chat-footer-container">
      {/* Quick Help Button - Above the logo */}
      <FollowUpPromptBar />
      
      {/* Powered By Section - Below the button */}
      <div className="chat-footer">
        <span className="chat-footer-content">
          Powered by{" "}
          
          {showLogo ? (
            // Show MyRecruiter company logo
            <img 
              src={myRecruiterLogoUrl}
              onError={handleLogoError}
              onLoad={handleLogoLoad}
              alt={brandText}
              className="chat-footer-logo"
            />
          ) : (
            // Fallback to text only if MyRecruiter logo fails to load
            <span className="chat-footer-brand-text">
              {brandText}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}