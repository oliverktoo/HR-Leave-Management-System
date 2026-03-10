/**
 * Mobile Services Hook
 * Initializes and manages mobile services (geofencing, offline storage, sync)
 */

import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { offlineStorage } from '../services/offlineStorageService';
import { geofencingService } from '../services/geofencingService';
import { syncService } from '../services/syncService';

export interface MobileServicesStatus {
  isNative: boolean;
  offlineStorageReady: boolean;
  geofencingReady: boolean;
  syncActive: boolean;
  isOnline: boolean;
  unsyncedCount: number;
}

export const useMobileServices = () => {
  const [status, setStatus] = useState<MobileServicesStatus>({
    isNative: Capacitor.isNativePlatform(),
    offlineStorageReady: false,
    geofencingReady: false,
    syncActive: false,
    isOnline: navigator.onLine,
    unsyncedCount: 0
  });

  const [initError, setInitError] = useState<string | null>(null);

  // Initialize mobile services
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      console.log('📱 Running on web - mobile features disabled');
      return;
    }

    const initializeMobileServices = async () => {
      try {
        console.log('🚀 Initializing mobile services...');

        // Initialize offline storage
        await offlineStorage.initialize();
        setStatus(prev => ({ ...prev, offlineStorageReady: true }));

        // Initialize geofencing
        await geofencingService.initialize();
        await geofencingService.startMonitoring();
        setStatus(prev => ({ ...prev, geofencingReady: true }));

        // Setup geofence notification handler
        geofencingService.setupNotificationHandlers(() => {
          console.log('📍 User tapped geofence notification');
          // Navigate to attendance page or show check-in UI
          // This can be customized based on your app's navigation
        });

        // Start auto-sync
        syncService.startAutoSync((result) => {
          console.log(`🔄 Sync completed: ${result.syncedCount} records synced`);
          updateSyncStatus();
        });
        setStatus(prev => ({ ...prev, syncActive: true }));

        // Update unsynced count
        await updateSyncStatus();

        console.log('✅ Mobile services initialized successfully');
      } catch (error) {
        console.error('❌ Error initializing mobile services:', error);
        setInitError(error instanceof Error ? error.message : 'Failed to initialize mobile services');
      }
    };

    initializeMobileServices();

    // Cleanup on unmount
    return () => {
      if (Capacitor.isNativePlatform()) {
        syncService.stopAutoSync();
        geofencingService.stopMonitoring();
        offlineStorage.close();
      }
    };
  }, []);

  // Monitor network status
  useEffect(() => {
    const handleOnline = () => {
      console.log('🌐 Device is online');
      setStatus(prev => ({ ...prev, isOnline: true }));
      
      // Trigger sync when coming back online
      if (Capacitor.isNativePlatform()) {
        syncService.forceSyncNow().then(result => {
          console.log(`🔄 Auto-sync on reconnect: ${result.syncedCount} records synced`);
          updateSyncStatus();
        });
      }
    };

    const handleOffline = () => {
      console.log('📴 Device is offline');
      setStatus(prev => ({ ...prev, isOnline: false }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Monitor app state changes (background/foreground)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    const appStateListener = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        console.log('📱 App resumed - checking for updates');
        updateSyncStatus();
        
        // Try to sync when app comes to foreground
        if (navigator.onLine) {
          syncService.forceSyncNow();
        }
      }
    });

    return () => {
      appStateListener.then(listener => listener.remove());
    };
  }, []);

  // Update sync status
  const updateSyncStatus = async () => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    const syncStatus = await syncService.getSyncStatus();
    setStatus(prev => ({
      ...prev,
      unsyncedCount: syncStatus.unsyncedCount,
      isOnline: syncStatus.isOnline
    }));
  };

  // Manual sync trigger
  const triggerSync = async () => {
    if (!Capacitor.isNativePlatform()) {
      console.warn('⚠️ Sync not available on web platform');
      return { syncSuccess: false, message: 'Sync not available on web' };
    }

    if (!navigator.onLine) {
      return { syncSuccess: false, message: 'Device is offline' };
    }

    try {
      const result = await syncService.forceSyncNow();
      await updateSyncStatus();
      
      return {
        syncSuccess: result.success,
        message: `Synced ${result.syncedCount} records`,
        syncedCount: result.syncedCount,
        failedCount: result.failedCount,
        errors: result.errors
      };
    } catch (error) {
      return {
        syncSuccess: false,
        message: error instanceof Error ? error.message : 'Sync failed'
      };
    }
  };

  // Check if at office location
  const checkOfficeLocation = async () => {
    if (!Capacitor.isNativePlatform()) {
      return { isAtOffice: false, distance: 0, error: 'Not on mobile' };
    }

    return await geofencingService.checkIfAtOffice();
  };

  return {
    status,
    initError,
    triggerSync,
    checkOfficeLocation,
    refreshSyncStatus: updateSyncStatus
  };
};
