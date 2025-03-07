// VPS Storage Manager for Time Tracker App
// Path: src/data/storage/vpsStore.js

const { VpsManager, VpsTimeEntrySync, VpsScreenshotSync, VpsCleanup } = require('./vps');
const dbManager = require('../db/dbManager');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class VpsStore {
  constructor() {
    // Default configuration
    const config = {
      baseUrl: process.env.VPS_API_URL || 'http://162.243.56.27:3000/api',
      apiKey: process.env.VPS_API_KEY || '41e5f38cd7486265f96c0defc49ba9af5a11962a61bc9bb71a993e51156b7c5e',
      timeout: 30000 // 30 seconds
    };
    
    // Create VPS manager
    this.vpsManager = new VpsManager(config);
    
    // Initialize modules
    this.timeEntrySync = new VpsTimeEntrySync(this.vpsManager);
    this.screenshotSync = new VpsScreenshotSync(this.vpsManager);
    this.cleanup = new VpsCleanup(this.vpsManager);
    
    this.initialized = false;
    this.syncInterval = null;
    this.lastSyncTime = null;
    
    // Default retention period: 365 days
    this.retentionDays = 365;
    
    // Thumbnail path for caching
    this.thumbnailPath = path.join(app.getPath('userData'), 'thumbnails');
    
    // Make sure thumbnail directory exists
    if (!fs.existsSync(this.thumbnailPath)) {
      try {
        fs.mkdirSync(this.thumbnailPath, { recursive: true });
      } catch (error) {
        console.error('Failed to create thumbnails directory:', error);
      }
    }
  }

  /**
   * Initialize VPS connection
   * @returns {Promise<boolean>} - Success status
   */
  async initialize() {
    if (this.initialized) return true;

    try {
      // Initialize VPS manager
      const success = await this.vpsManager.initialize();
      
      if (!success) {
        console.error('Failed to initialize VPS Manager');
        return false;
      }
      
      this.initialized = true;
      this.lastSyncTime = Date.now();
      
      console.log('VPS Store initialized successfully');
      return true;
    } catch (error) {
      console.error('Error initializing VPS Store:', error);
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
            console.error('Cannot start auto-sync: VPS store initialization failed');
          }
        })
        .catch(error => {
          console.error('Error initializing VPS store for auto-sync:', error);
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
   * Synchronize all pending data to VPS server
   * @returns {Promise<Object>} - Sync results
   */
  async syncPendingData() {
    // Ensure VPS connection is initialized
    if (!this.initialized) {
      const success = await this.initialize();
      if (!success) {
        throw new Error('Failed to initialize VPS connection');
      }
    }
    
    try {
      console.log('Starting sync process...');
      
      // Sync time entries
      const timeEntryResults = await this.timeEntrySync.syncPendingTimeEntries();
      
      // Sync screenshots
      const screenshotResults = await this.screenshotSync.syncPendingScreenshots();
      
      // Clean up old data on VPS
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
      
      // Get server-side stats
      let storageStats = {};
      if (this.initialized) {
        try {
          storageStats = await this.cleanup.getStorageStats();
        } catch (statsError) {
          console.warn('Could not retrieve server storage stats:', statsError);
        }
      }
      
      return {
        lastSync: this.lastSyncTime ? new Date(this.lastSyncTime).toISOString() : null,
        pending,
        errors,
        isInitialized: this.initialized,
        storage: storageStats
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

  /**
   * Fetch time entries from VPS server
   * @param {Object} filters - Filters for time entries (dateFrom, dateTo, userId, etc.)
   * @returns {Promise<Array>} - Array of time entry objects
   */
  async fetchTimeEntriesFromVps(filters = {}) {
    return this.timeEntrySync.getTimeEntriesFromVps(filters);
  }

  /**
   * Find screenshot files on VPS by time entry ID
   * @param {number} timeEntryId - Time entry ID
   * @returns {Promise<Array>} - Array of screenshot file objects
   */
  async findScreenshotsByTimeEntry(timeEntryId) {
    return this.screenshotSync.findScreenshotsByTimeEntry(timeEntryId);
  }

  /**
   * Download a screenshot from VPS
   * @param {string} screenshotId - Screenshot ID
   * @param {boolean} useThumbnail - Whether to download thumbnail instead of full image
   * @returns {Promise<Object>} - Screenshot data object
   */
  async downloadScreenshot(screenshotId, useThumbnail = false) {
    return this.screenshotSync.downloadScreenshot(screenshotId, useThumbnail);
  }

  /**
   * Clear screenshot cache
   */
  clearScreenshotCache() {
    this.screenshotSync.clearCache();
  }

  /**
   * Check connection to VPS server
   * @returns {Promise<boolean>} - True if connection is working
   */
  async checkConnection() {
    try {
      if (!this.initialized) {
        await this.initialize();
      }
      
      return await this.vpsManager.testConnection();
    } catch (error) {
      console.error('Error checking VPS connection:', error);
      return false;
    }
  }

  /**
   * Configure VPS connection
   * @param {Object} config - Configuration object with baseUrl and apiKey
   * @returns {Promise<boolean>} - Success status
   */
  async configureConnection(config) {
    try {
      // Save configuration
      const success = await this.vpsManager.saveConfig(config);
      
      if (success) {
        // Re-initialize with new configuration
        this.initialized = false; // Force re-initialization
        return await this.initialize();
      }
      
      return false;
    } catch (error) {
      console.error('Error configuring VPS connection:', error);
      return false;
    }
  }
}

// Export a singleton instance
const vpsStore = new VpsStore();
module.exports = vpsStore;