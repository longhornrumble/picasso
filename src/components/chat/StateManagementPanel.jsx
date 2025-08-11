/**
 * State Management Panel - Phase 3.4 User-Facing Controls
 * 
 * Provides user interface for:
 * - Conversation history management
 * - State clearing with audit compliance
 * - PWA installation prompts
 * - Offline status and sync controls
 * - Data export capabilities
 */

import React, { useState, useEffect } from 'react';
import { 
  History, 
  Trash2, 
  Download, 
  Settings, 
  Wifi, 
  WifiOff, 
  Smartphone,
  RefreshCw,
  Eye,
  EyeOff,
  X,
  Clock,
  MessageSquare
} from 'lucide-react';

import { useChat } from '../../hooks/useChat';
import { errorLogger } from '../../utils/errorHandling';
import { config as environmentConfig } from '../../config/environment';

const StateManagementPanel = ({ isOpen, onClose }) => {
  const { 
    conversationMetadata, 
    mobileFeatures, 
    clearMessages,
    messages 
  } = useChat();

  // Local state for panel functionality
  const [activeTab, setActiveTab] = useState('history');
  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Load conversation history when panel opens
  useEffect(() => {
    if (isOpen && activeTab === 'history') {
      loadConversationHistory();
    }
  }, [isOpen, activeTab]);

  const loadConversationHistory = async () => {
    setIsLoadingHistory(true);
    try {
      // Get conversation history from localStorage first (Phase 3.2 fallback)
      const stored = localStorage.getItem('picasso_conversations');
      if (stored) {
        const conversations = JSON.parse(stored);
        setConversationHistory(conversations.slice(0, 10)); // Show last 10
      }

      // TODO: In future, load from DynamoDB via Lambda endpoint
      // const history = await conversationManager.getConversationHistory(10);
      
    } catch (error) {
      errorLogger.logError(error, { context: 'load_conversation_history' });
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleClearState = async () => {
    if (!showClearConfirm) {
      setShowClearConfirm(true);
      return;
    }

    setIsClearing(true);
    try {
      // Clear messages through ChatProvider
      await clearMessages();

      // Call Phase 2 audit endpoint for compliance
      const tenantHash = environmentConfig.getTenantHashFromURL() || 
                         environmentConfig.getDefaultTenantHash();
      
      const auditResponse = await fetch(environmentConfig.getConfigUrl(tenantHash).replace('get_config', 'clear_state'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tenant_hash: tenantHash,
          user_action: 'manual_clear',
          timestamp: new Date().toISOString(),
          conversation_count: messages.length
        })
      });

      if (auditResponse.ok) {
        errorLogger.logInfo('✅ State cleared with audit logging', {
          messageCount: messages.length,
          auditLogged: true
        });
      }

      // Clear local history
      localStorage.removeItem('picasso_conversations');
      sessionStorage.removeItem('picasso_current_conversation');
      
      setConversationHistory([]);
      setShowClearConfirm(false);
      
      // Show success feedback
      showNotification('Conversation history cleared', 'success');

    } catch (error) {
      errorLogger.logError(error, { context: 'clear_state_ui' });
      showNotification('Failed to clear state', 'error');
    } finally {
      setIsClearing(false);
    }
  };

  const handleExportConversations = async () => {
    try {
      const exportData = {
        tenant_hash: environmentConfig.getTenantHashFromURL()?.slice(0, 8) + '...',
        export_date: new Date().toISOString(),
        current_conversation: {
          id: conversationMetadata.conversationId,
          message_count: messages.length,
          messages: messages.map(msg => ({
            id: msg.id,
            role: msg.role,
            timestamp: msg.timestamp,
            content_length: msg.content ? msg.content.length : 0
            // Note: Not exporting actual content for privacy
          }))
        },
        conversation_history: conversationHistory.map(conv => ({
          id: conv.conversationId,
          created: conv.metadata?.created,
          message_count: conv.messages?.length || 0,
          summary: conv.metadata?.lastSummary?.slice(0, 100) || 'No summary'
        }))
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      });
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `picasso-conversations-${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);

      showNotification('Conversations exported', 'success');

    } catch (error) {
      errorLogger.logError(error, { context: 'export_conversations' });
      showNotification('Export failed', 'error');
    }
  };

  const handleInstallPWA = async () => {
    try {
      if (mobileFeatures.isPWAInstallable && window.deferredPrompt) {
        const result = await window.deferredPrompt.prompt();
        if (result.outcome === 'accepted') {
          showNotification('App installed successfully', 'success');
        }
      } else {
        showNotification('App installation not available', 'info');
      }
    } catch (error) {
      errorLogger.logError(error, { context: 'pwa_install' });
      showNotification('Installation failed', 'error');
    }
  };

  const showNotification = (message, type = 'info') => {
    // Simple notification system - could be enhanced with toast library
    const notification = document.createElement('div');
    notification.className = `state-notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 3000);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown date';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return 'Invalid date';
    }
  };

  const formatDuration = (conversation) => {
    if (!conversation.messages || conversation.messages.length < 2) {
      return 'Single message';
    }
    
    const first = conversation.messages[0];
    const last = conversation.messages[conversation.messages.length - 1];
    
    if (first.timestamp && last.timestamp) {
      const duration = new Date(last.timestamp) - new Date(first.timestamp);
      const minutes = Math.round(duration / 60000);
      return minutes > 0 ? `${minutes} min` : 'Less than a minute';
    }
    
    return 'Unknown duration';
  };

  if (!isOpen) return null;

  return (
    <div className="state-management-overlay">
      <div className="state-management-panel">
        {/* Header */}
        <div className="state-panel-header">
          <h3>Chat Settings</h3>
          <button onClick={onClose} className="state-panel-close">
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="state-panel-tabs">
          <button 
            className={`state-tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <History size={16} />
            History
          </button>
          <button 
            className={`state-tab ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <Settings size={16} />
            Settings
          </button>
          <button 
            className={`state-tab ${activeTab === 'data' ? 'active' : ''}`}
            onClick={() => setActiveTab('data')}
          >
            <Download size={16} />
            Data
          </button>
        </div>

        {/* Tab Content */}
        <div className="state-panel-content">
          
          {/* History Tab */}
          {activeTab === 'history' && (
            <div className="state-tab-content">
              <div className="current-conversation">
                <h4>Current Conversation</h4>
                <div className="conversation-stats">
                  <div className="stat">
                    <MessageSquare size={16} />
                    <span>{messages.length} messages</span>
                  </div>
                  {conversationMetadata.conversationId && (
                    <div className="stat">
                      <Clock size={16} />
                      <span>ID: {conversationMetadata.conversationId.slice(-8)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="conversation-history">
                <h4>Recent Conversations</h4>
                {isLoadingHistory ? (
                  <div className="loading-state">
                    <RefreshCw size={16} className="spin" />
                    Loading history...
                  </div>
                ) : conversationHistory.length > 0 ? (
                  <div className="history-list">
                    {conversationHistory.map((conv, index) => (
                      <div key={conv.conversationId || index} className="history-item conversation-entry">
                        <div className="conversation-header">
                          <span className="conversation-date">{formatDate(conv.metadata?.created)}</span>
                          <span className="message-count">{conv.messages?.length || 0} messages</span>
                        </div>
                        <div className="conversation-type">{formatDuration(conv)}</div>
                        {conv.metadata?.lastSummary && (
                          <div className="history-summary">
                            {conv.metadata.lastSummary.slice(0, 60)}...
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <History size={32} />
                    <p>No conversation history found</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="state-tab-content">
              {/* Connection Status */}
              <div className="settings-section">
                <h4>Connection Status</h4>
                <div className="status-item">
                  {navigator.onLine ? (
                    <>
                      <Wifi size={16} className="status-online" />
                      <span>Online</span>
                    </>
                  ) : (
                    <>
                      <WifiOff size={16} className="status-offline" />
                      <span>Offline</span>
                    </>
                  )}
                </div>
                {mobileFeatures.isOfflineCapable && (
                  <div className="status-feature">
                    ✅ Offline conversation sync enabled
                  </div>
                )}
              </div>

              {/* PWA Installation */}
              {mobileFeatures.isPWAInstallable && (
                <div className="settings-section">
                  <h4>App Installation</h4>
                  <button onClick={handleInstallPWA} className="pwa-install-button">
                    <Smartphone size={16} />
                    Install as App
                  </button>
                  <p className="pwa-description">
                    Install Picasso Chat for a native app experience with offline support.
                  </p>
                </div>
              )}

              {/* Mobile Features Status */}
              {mobileFeatures.isMobileSafari && (
                <div className="settings-section">
                  <h4>Mobile Features</h4>
                  <div className="feature-list">
                    <div className="feature-item">
                      ✅ iOS Safari optimizations active
                    </div>
                    <div className="feature-item">
                      ✅ Touch-friendly interface
                    </div>
                    <div className="feature-item">
                      ✅ Keyboard handling optimized
                    </div>
                  </div>
                </div>
              )}

              {/* Clear State Controls */}
              <div className="settings-section danger-section">
                <h4>Reset Conversation</h4>
                {!showClearConfirm ? (
                  <button onClick={handleClearState} className="clear-button">
                    <Trash2 size={16} />
                    Clear All Messages
                  </button>
                ) : (
                  <div className="clear-confirm">
                    <p>⚠️ This will permanently delete all conversation history.</p>
                    <div className="confirm-buttons">
                      <button 
                        onClick={handleClearState} 
                        className="confirm-clear"
                        disabled={isClearing}
                      >
                        {isClearing ? <RefreshCw size={16} className="spin" /> : <Trash2 size={16} />}
                        {isClearing ? 'Clearing...' : 'Confirm Delete'}
                      </button>
                      <button 
                        onClick={() => setShowClearConfirm(false)}
                        className="cancel-clear"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                <p className="clear-description">
                  This action is logged for audit compliance and cannot be undone.
                </p>
              </div>
            </div>
          )}

          {/* Data Tab */}
          {activeTab === 'data' && (
            <div className="state-tab-content">
              <div className="settings-section">
                <h4>Export Conversation Data</h4>
                <button onClick={handleExportConversations} className="export-button">
                  <Download size={16} />
                  Download Conversations
                </button>
                <p className="export-description">
                  Export conversation metadata and statistics (content not included for privacy).
                </p>
              </div>

              <div className="settings-section">
                <h4>Data Management</h4>
                <div className="data-stats">
                  <div className="data-stat">
                    <strong>Current Session:</strong> {messages.length} messages
                  </div>
                  <div className="data-stat storage-info">
                    <div className="storage-details">
                      <div className="info-label">Storage Type:</div>
                      <div className="info-value">Session-based</div>
                      <div className="info-description">(cleared on browser close)</div>
                    </div>
                  </div>
                  <div className="data-stat">
                    <strong>History:</strong> {conversationHistory.length} past conversations
                  </div>
                </div>
              </div>

              <div className="settings-section">
                <h4>Privacy & Compliance</h4>
                <div className="privacy-info">
                  <p>✅ All data is encrypted in transit</p>
                  <p>✅ No personal information stored permanently</p>
                  <p>✅ Audit logging for compliance</p>
                  <p>✅ Data retention: 30 minutes session storage</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StateManagementPanel;