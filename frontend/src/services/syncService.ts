/**
 * Sync Service
 * Handles synchronization of offline attendance records to Supabase
 */

import { supabase } from '../lib/supabaseClient';
import { offlineStorage, OfflineAttendanceRecord } from './offlineStorageService';
import { SYNC_CHECK_INTERVAL } from '../config/geofenceConfig';

export interface SyncResult {
  success: boolean;
  syncedCount: number;
  failedCount: number;
  errors: string[];
}

class SyncService {
  private syncInterval: NodeJS.Timeout | null = null;
  private isSyncing = false;
  private onSyncCallback: ((result: SyncResult) => void) | null = null;

  /**
   * Start automatic sync monitoring
   */
  startAutoSync(onSync?: (result: SyncResult) => void): void {
    if (this.syncInterval) {
      console.log('⚠️ Auto-sync already running');
      return;
    }

    this.onSyncCallback = onSync || null;

    // Initial sync
    this.syncOfflineRecords();

    // Set up periodic sync
    this.syncInterval = setInterval(() => {
      if (this.isOnline()) {
        this.syncOfflineRecords();
      }
    }, SYNC_CHECK_INTERVAL);

    console.log('✅ Auto-sync started');
  }

  /**
   * Stop automatic sync monitoring
   */
  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('⏹️ Auto-sync stopped');
    }
  }

  /**
   * Check if device is online
   */
  isOnline(): boolean {
    return navigator.onLine;
  }

  /**
   * Sync all offline records to Supabase
   */
  async syncOfflineRecords(): Promise<SyncResult> {
    if (this.isSyncing) {
      console.log('⚠️ Sync already in progress');
      return {
        success: false,
        syncedCount: 0,
        failedCount: 0,
        errors: ['Sync already in progress']
      };
    }

    if (!this.isOnline()) {
      console.log('⚠️ Cannot sync - device is offline');
      return {
        success: false,
        syncedCount: 0,
        failedCount: 0,
        errors: ['Device is offline']
      };
    }

    if (!offlineStorage.isAvailable()) {
      console.log('⚠️ Offline storage not available');
      return {
        success: true,
        syncedCount: 0,
        failedCount: 0,
        errors: []
      };
    }

    this.isSyncing = true;
    const result: SyncResult = {
      success: true,
      syncedCount: 0,
      failedCount: 0,
      errors: []
    };

    try {
      // Get all unsynced records
      const unsyncedRecords = await offlineStorage.getUnsyncedRecords();
      
      if (unsyncedRecords.length === 0) {
        console.log('✅ No records to sync');
        return result;
      }

      console.log(`🔄 Syncing ${unsyncedRecords.length} offline records...`);

      // Sync each record
      for (const record of unsyncedRecords) {
        try {
          await this.syncSingleRecord(record);
          result.syncedCount++;
          
          // Mark as synced in local database
          if (record.id) {
            await offlineStorage.markAsSynced(record.id);
          }
        } catch (error) {
          result.failedCount++;
          result.errors.push(
            `Failed to sync record ${record.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
          console.error('❌ Error syncing record:', record.id, error);
        }
      }

      // Clean up old synced records (keep last 30 days)
      await offlineStorage.cleanupOldRecords(30);

      console.log(`✅ Sync complete: ${result.syncedCount} synced, ${result.failedCount} failed`);
      
      // Call callback if provided
      if (this.onSyncCallback) {
        this.onSyncCallback(result);
      }

    } catch (error) {
      console.error('❌ Error during sync:', error);
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Unknown sync error');
    } finally {
      this.isSyncing = false;
    }

    return result;
  }

  /**
   * Sync a single attendance record to Supabase
   */
  private async syncSingleRecord(record: OfflineAttendanceRecord): Promise<void> {
    // Create point type for PostgreSQL
    const coords = `(${record.coords_lng},${record.coords_lat})`;

    const { error } = await supabase
      .from('attendance_records')
      .insert({
        user_id: record.user_id,
        employee_id: record.employee_id,
        employee_name: record.employee_name,
        check_in_time: record.check_in_time,
        date: record.date,
        status: record.status,
        location: record.location,
        coords: coords,
        notes: record.notes,
        created_at: record.created_at,
        is_offline_sync: true,
        synced_at: new Date().toISOString()
      });

    if (error) {
      throw error;
    }
  }

  /**
   * Get current sync status
   */
  async getSyncStatus(): Promise<{
    isOnline: boolean;
    isSyncing: boolean;
    unsyncedCount: number;
  }> {
    const unsyncedCount = offlineStorage.isAvailable() 
      ? await offlineStorage.getUnsyncedCount()
      : 0;

    return {
      isOnline: this.isOnline(),
      isSyncing: this.isSyncing,
      unsyncedCount
    };
  }

  /**
   * Force sync now (manual trigger)
   */
  async forceSyncNow(): Promise<SyncResult> {
    return await this.syncOfflineRecords();
  }
}

// Export singleton instance
export const syncService = new SyncService();
