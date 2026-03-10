/**
 * Offline Storage Service
 * Handles SQLite database operations for offline attendance records
 */

import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';

export interface OfflineAttendanceRecord {
  id?: number;
  user_id: string;
  employee_id: string;
  employee_name: string;
  check_in_time: string;
  date: string;
  status: 'present' | 'late' | 'half_day' | 'absent';
  location: string;
  coords_lat: number;
  coords_lng: number;
  notes?: string;
  created_at: string;
  synced: 0 | 1; // SQLite uses 0/1 for boolean
}

class OfflineStorageService {
  private sqliteConnection: SQLiteConnection | null = null;
  private db: SQLiteDBConnection | null = null;
  private readonly DB_NAME = 'fkf_hr_attendance';
  private readonly DB_VERSION = 1;
  private isInitialized = false;

  /**
   * Initialize SQLite database
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Only initialize on native platforms (not web)
      if (Capacitor.isNativePlatform()) {
        this.sqliteConnection = new SQLiteConnection(CapacitorSQLite);
        
        // Create database connection
        this.db = await this.sqliteConnection.createConnection(
          this.DB_NAME,
          false, // encrypted
          'no-encryption',
          this.DB_VERSION,
          false // readonly
        );

        // Open database
        await this.db.open();

        // Create tables
        await this.createTables();

        this.isInitialized = true;
        console.log('✅ Offline storage initialized');
      } else {
        console.warn('⚠️ SQLite not available on web platform - offline storage disabled');
      }
    } catch (error) {
      console.error('❌ Error initializing offline storage:', error);
      throw error;
    }
  }

  /**
   * Create database tables
   */
  private async createTables(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS offline_attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        employee_id TEXT NOT NULL,
        employee_name TEXT NOT NULL,
        check_in_time TEXT NOT NULL,
        date TEXT NOT NULL,
        status TEXT NOT NULL,
        location TEXT,
        coords_lat REAL NOT NULL,
        coords_lng REAL NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL,
        synced INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_offline_attendance_synced 
      ON offline_attendance(synced);

      CREATE INDEX IF NOT EXISTS idx_offline_attendance_date 
      ON offline_attendance(date);
    `;

    await this.db.execute(createTableSQL);
  }

  /**
   * Save attendance record offline
   */
  async saveAttendance(record: Omit<OfflineAttendanceRecord, 'id' | 'synced'>): Promise<number> {
    if (!Capacitor.isNativePlatform() || !this.db) {
      console.warn('⚠️ Cannot save offline - not on native platform');
      throw new Error('Offline storage not available');
    }

    try {
      const sql = `
        INSERT INTO offline_attendance (
          user_id, employee_id, employee_name, check_in_time, date, 
          status, location, coords_lat, coords_lng, notes, created_at, synced
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `;

      const result = await this.db.run(sql, [
        record.user_id,
        record.employee_id,
        record.employee_name,
        record.check_in_time,
        record.date,
        record.status,
        record.location,
        record.coords_lat,
        record.coords_lng,
        record.notes || null,
        record.created_at
      ]);

      const insertId = result.changes?.lastId || 0;
      console.log('✅ Attendance saved offline, ID:', insertId);
      return insertId;
    } catch (error) {
      console.error('❌ Error saving offline attendance:', error);
      throw error;
    }
  }

  /**
   * Get all unsynced attendance records
   */
  async getUnsyncedRecords(): Promise<OfflineAttendanceRecord[]> {
    if (!Capacitor.isNativePlatform() || !this.db) {
      return [];
    }

    try {
      const sql = `
        SELECT * FROM offline_attendance 
        WHERE synced = 0 
        ORDER BY created_at ASC
      `;

      const result = await this.db.query(sql);
      return result.values || [];
    } catch (error) {
      console.error('❌ Error fetching unsynced records:', error);
      return [];
    }
  }

  /**
   * Mark record as synced
   */
  async markAsSynced(id: number): Promise<void> {
    if (!Capacitor.isNativePlatform() || !this.db) {
      return;
    }

    try {
      const sql = `UPDATE offline_attendance SET synced = 1 WHERE id = ?`;
      await this.db.run(sql, [id]);
      console.log('✅ Record marked as synced:', id);
    } catch (error) {
      console.error('❌ Error marking as synced:', error);
      throw error;
    }
  }

  /**
   * Delete synced records older than specified days
   */
  async cleanupOldRecords(daysToKeep: number = 30): Promise<void> {
    if (!Capacitor.isNativePlatform() || !this.db) {
      return;
    }

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      const cutoffISO = cutoffDate.toISOString();

      const sql = `
        DELETE FROM offline_attendance 
        WHERE synced = 1 AND created_at < ?
      `;

      const result = await this.db.run(sql, [cutoffISO]);
      console.log(`✅ Cleaned up ${result.changes?.changes || 0} old synced records`);
    } catch (error) {
      console.error('❌ Error cleaning up old records:', error);
    }
  }

  /**
   * Get total count of unsynced records
   */
  async getUnsyncedCount(): Promise<number> {
    if (!Capacitor.isNativePlatform() || !this.db) {
      return 0;
    }

    try {
      const sql = `SELECT COUNT(*) as count FROM offline_attendance WHERE synced = 0`;
      const result = await this.db.query(sql);
      return result.values?.[0]?.count || 0;
    } catch (error) {
      console.error('❌ Error getting unsynced count:', error);
      return 0;
    }
  }

  /**
   * Check if database is available and initialized
   */
  isAvailable(): boolean {
    return Capacitor.isNativePlatform() && this.isInitialized;
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
      this.isInitialized = false;
      console.log('🔒 Offline storage closed');
    }
  }
}

// Export singleton instance
export const offlineStorage = new OfflineStorageService();
