/**
 * Mobile Status Indicator
 * Shows network status, sync status, and offline pending records
 */

import { useState } from 'react';
import { useMobileServices } from '../../hooks/useMobileServices';
import './MobileStatus.css';

export const MobileStatus = () => {
  const { status, triggerSync, checkOfficeLocation } = useMobileServices();
  const [syncMessage, setSyncMessage] = useState<string>('');
  const [isChecking, setIsChecking] = useState(false);

  if (!status.isNative) {
    // Don't show on web
    return null;
  }

  const handleManualSync = async () => {
    setIsChecking(true);
    setSyncMessage('Syncing...');
    
    const result = await triggerSync();
    setSyncMessage(result.message);
    
    setTimeout(() => {
      setSyncMessage('');
      setIsChecking(false);
    }, 3000);
  };

  const handleCheckLocation = async () => {
    setIsChecking(true);
    const result = await checkOfficeLocation();
    
    if (result.isAtOffice) {
      setSyncMessage(`✓ At office (${result.distance}m away)`);
    } else {
      setSyncMessage(`✗ Not at office (${result.distance}m away)`);
    }
    
    setTimeout(() => {
      setSyncMessage('');
      setIsChecking(false);
    }, 3000);
  };

  return (
    <div className="mobile-status-container">
      {/* Network Status Indicator */}
      <div className={`network-status ${status.isOnline ? 'online' : 'offline'}`}>
        <span className="status-dot"></span>
        <span className="status-text">
          {status.isOnline ? 'Online' : 'Offline'}
        </span>
      </div>

      {/* Unsynced Records Badge */}
      {status.unsyncedCount > 0 && (
        <div className="unsynced-badge">
          <span className="badge-icon">📦</span>
          <span className="badge-count">{status.unsyncedCount}</span>
          <span className="badge-text">pending</span>
        </div>
      )}

      {/* Sync Button */}
      {status.isOnline && status.unsyncedCount > 0 && (
        <button 
          className="sync-button"
          onClick={handleManualSync}
          disabled={isChecking}
        >
          {isChecking ? '⏳' : '🔄'} Sync Now
        </button>
      )}

      {/* Location Check Button */}
      <button 
        className="location-button"
        onClick={handleCheckLocation}
        disabled={isChecking}
        title="Check if at office location"
      >
        📍
      </button>

      {/* Message Display */}
      {syncMessage && (
        <div className="sync-message">
          {syncMessage}
        </div>
      )}

      {/* Service Status (for debugging - can be hidden in production) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="debug-status">
          <small>
            Storage: {status.offlineStorageReady ? '✓' : '✗'} | 
            Geofence: {status.geofencingReady ? '✓' : '✗'} | 
            Sync: {status.syncActive ? '✓' : '✗'}
          </small>
        </div>
      )}
    </div>
  );
};
