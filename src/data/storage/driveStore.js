// Google Drive Storage Manager for Time Tracker App
// Path: src/data/storage/driveStore.js

const DriveManager = require('./drive/driveManager');
const DriveTimeEntrySync = require('./drive/driveTimeEntrySync');
const DriveScreenshotSync = require('./drive/driveScreenshotSync');
const DriveCleanup = require('./drive/driveCleanup');
const dbManager = require('../db/dbManager');

class DriveStore {
  constructor() {
    // Create drive manager
    this.driveManager = new DriveManager();
    
    // Initialize modules with null references to be created after initialization
    this.timeEntrySync = null;
    this.screenshotSync = null;
    this.cleanup = null;
    
    this.initialized = false;
    this.syncInterval = null;
    this.lastSyncTime = null;
    
    // Default retention period: 365 days
    this.retentionDays = 365;
  }

  /**
   * Initialize Google Drive connection
   * @returns {Promise<boolean>} - Success status
   */
  async initialize() {
    if (this.initialized) return true;

    try {
      // Initialize drive manager
      const success = await this.driveManager.initialize();
      
      if (!success) {
        console.error('Failed to initialize Drive Manager');
        return false;
      }
      
      // Create modules with the initialized drive manager
      this.timeEntrySync = new DriveTimeEntrySync(this.driveManager);
      this.screenshotSync = new DriveScreenshotSync(this.driveManager);
      this.cleanup = new DriveCleanup(this.driveManager, this.retentionDays);
      
      this.initialized = true;
      this.lastSyncTime = Date.now();
      
      console.log('Drive Store initialized successfully');
      return true;
    } catch (error) {
      console.error('Error initializing Drive Store:', error);
      return false;
    }
  }

  /**
   * Start automatic synchronization
   * @param {number} intervalMinutes - Sync interval in minutes
   */
  startAutoSync(intervalMinutes = 15) {
    // Stop any existing sync interval
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    
    // Convert minutes to milliseconds
    const interval = intervalMinutes * 60 * 1000;
    
    // Make sure we're initialized first
    if (!this.initialized) {
      this.initialize()
        .then(success => {
          if (success) {
            this.setupAutoSync(interval);
          } else {
            console.error('Cannot start auto-sync: Drive store initialization failed');
          }
        })
        .catch(error => {
          console.error('Error initializing drive store for auto-sync:', error);
        });
    } else {
      this.setupAutoSync(interval);
    }
  }

  /**
   * Set up the automatic sync interval
   * @param {number} interval - The interval in milliseconds
   * @private
   */
  setupAutoSync(interval) {
    console.log(`Setting up auto-sync with ${interval/60000} minute interval`);
    
    // Run an initial sync
    this.syncPendingData()
      .catch(error => console.error('Initial auto-sync error:', error));
    
    // Start a new sync interval
    this.syncInterval = setInterval(() => {
      console.log('Running scheduled sync...');
      this.syncPendingData()
        .then(result => {
          console.log('Auto-sync completed:', result);
        })
        .catch(error => {
          console.error('Auto-sync error:', error);
        });
    }, interval);
    
    console.log(`Auto-sync started with ${interval/60000} minute interval`);
  }

  /**
   * Stop automatic synchronization
   */
  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('Auto-sync stopped');
    }
  }

  /**
   * Synchronize all pending data to Google Drive
   * @returns {Promise<Object>} - Sync results
   */
  async syncPendingData() {
    // Ensure Drive connection is initialized
    if (!this.initialized) {
      const success = await this.initialize();
      if (!success) {
        throw new Error('Failed to initialize Google Drive connection');
      }
    }
    
    try {
      console.log('Starting sync process...');
      
      // Sync time entries
      const timeEntryResults = await this.timeEntrySync.syncPendingTimeEntries();
      
      // Sync screenshots
      const screenshotResults = await this.screenshotSync.syncPendingScreenshots();
      
      // Clean up old data in Google Drive
      // Only run cleanup occasionally (e.g., once per day)
      let cleanupResults = { totalDeleted: 0 };
      if (!this.lastCleanupTime || (Date.now() - this.lastCleanupTime > 24 * 60 * 60 * 1000)) {
        cleanupResults = await this.cleanup.cleanupOldData();
        this.lastCleanupTime = Date.now();
      }
      
      // Update last sync time
      this.lastSyncTime = Date.now();
      
      console.log(`Sync process completed successfully. Synced ${timeEntryResults.synced}/${timeEntryResults.pending} time entries and ${screenshotResults.synced}/${screenshotResults.pending} screenshots. Deleted ${cleanupResults.totalDeleted} old files.`);
      
      return {
        timeEntries: timeEntryResults,
        screenshots: screenshotResults,
        cleanupResults
      };
    } catch (error) {
      console.error('Sync process failed:', error);
      throw error;
    }
  }

  /**
   * Get sync status summary
   * @returns {Promise<Object>} - Sync status summary
   */
  async getSyncStatus() {
    try {
      // Get pending counts
      const pendingQuery = `
        SELECT entity_type, COUNT(*) as count
        FROM sync_status
        WHERE is_synced = 0
        GROUP BY entity_type
      `;
      const pendingResults = await dbManager.runQuery(pendingQuery);
      
      // Convert to object
      const pending = {
        time_entry: 0,
        screenshot: 0
      };
      
      pendingResults.forEach(result => {
        pending[result.entity_type] = result.count;
      });
      
      // Get error counts
      const errorQuery = `
        SELECT entity_type, COUNT(*) as count
        FROM sync_status
        WHERE sync_error IS NOT NULL
        GROUP BY entity_type
      `;
      const errorResults = await dbManager.runQuery(errorQuery);
      
      // Convert to object
      const errors = {
        time_entry: 0,
        screenshot: 0
      };
      
      errorResults.forEach(result => {
        errors[result.entity_type] = result.count;
      });
      
      return {
        lastSync: this.lastSyncTime ? new Date(this.lastSyncTime).toISOString() : null,
        pending,
        errors,
        isInitialized: this.initialized
      };
    } catch (error) {
      console.error('Error getting sync status:', error);
      return {
        lastSync: this.lastSyncTime ? new Date(this.lastSyncTime).toISOString() : null,
        pending: { time_entry: 0, screenshot: 0 },
        errors: { time_entry: 0, screenshot: 0 },
        isInitialized: this.initialized,
        error: error.message
      };
    }
  }

  /**
   * Get last sync time
   * @returns {Date|null} - Last sync time or null if never synced
   */
  getLastSyncTime() {
    return this.lastSyncTime ? new Date(this.lastSyncTime) : null;
  }
}

// Export a singleton instance
const driveStore = new DriveStore();
module.exports = driveStore;