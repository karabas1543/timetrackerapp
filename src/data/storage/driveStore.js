// Google Drive Storage Manager for Time Tracker App
// Path: src/data/storage/driveStore.js

const DriveManager = require('./drive/driveManager');
const DriveTimeEntrySync = require('./drive/driveTimeEntrySync');
const DriveScreenshotSync = require('./drive/driveScreenshotSync');
const DriveCleanup = require('./drive/driveCleanup');
const dbManager = require('../db/dbManager');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

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
    
    // Cache for screenshots
    this.screenshotCache = new Map();
    this.maxCacheSize = 50; // Maximum number of cached screenshots
    
    // Path for thumbnail storage
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

  /**
 * Fetch time entries from Google Drive
 * @param {Object} filters - Filters for time entries (dateFrom, dateTo, userId, etc.)
 * @returns {Promise<Array>} - Array of time entry objects
 */
async fetchTimeEntriesFromDrive(filters = {}) {
  // Ensure we're initialized
  if (!this.initialized) {
    await this.initialize();
  }

  try {
    console.log('Fetching time entries from Google Drive...');
    
    // Get all time entry files from Drive
    const timeEntryFiles = await this.driveManager.listFiles(
      this.driveManager.timeEntriesFolderId
    );
    
    console.log(`Found ${timeEntryFiles.length} time entry files in Drive`);
    
    // Fetch and parse each file
    const timeEntries = [];
    for (const file of timeEntryFiles) {
      try {
        // Download file content as JSON
        const fileContent = await this.downloadFileContents(file.id);
        if (!fileContent) continue;
        
        // Try to parse the content as JSON
        let timeEntry;
        try {
          timeEntry = JSON.parse(fileContent);
        } catch (parseError) {
          console.error(`Error parsing time entry file ${file.name}:`, parseError);
          
          // If file content starts with "[object Object]", it's likely the file was incorrectly saved
          if (fileContent.includes('[object Object]')) {
            console.warn(`File ${file.name} contains '[object Object]' and cannot be parsed.`);
            continue;
          }
          
          continue; // Skip this file
        }
        
        // Validate that we have a proper time entry object
        if (!timeEntry || !timeEntry.id || !timeEntry.start_time) {
          console.warn(`File ${file.name} does not contain a valid time entry:`, timeEntry);
          continue;
        }
        
        // Apply filters
        if (this.matchesFilters(timeEntry, filters)) {
          timeEntries.push(timeEntry);
        }
      } catch (error) {
        console.error(`Error processing time entry file ${file.name}:`, error);
      }
    }
    
    console.log(`Successfully fetched ${timeEntries.length} matching time entries from Drive`);
    return timeEntries;
  } catch (error) {
    console.error('Error fetching time entries from Drive:', error);
    throw error;
  }
}

  /**
   * Check if a time entry matches the given filters
   * @param {Object} timeEntry - The time entry to check
   * @param {Object} filters - The filters to apply
   * @returns {boolean} - True if the time entry matches the filters
   */
  matchesFilters(timeEntry, filters) {
    // User filter
    if (filters.userId && filters.userId !== 'all' && 
        timeEntry.user_id.toString() !== filters.userId.toString()) {
      return false;
    }
    
    // Client filter
    if (filters.clientId && filters.clientId !== 'all' && 
        timeEntry.client_id.toString() !== filters.clientId.toString()) {
      return false;
    }
    
    // Project filter
    if (filters.projectId && filters.projectId !== 'all' && 
        timeEntry.project_id.toString() !== filters.projectId.toString()) {
      return false;
    }
    
    // Date range filter
    if (filters.fromDate && filters.toDate) {
      const startTime = new Date(timeEntry.start_time).getTime();
      const fromDate = new Date(filters.fromDate).getTime();
      const toDate = new Date(filters.toDate + 'T23:59:59').getTime();
      
      if (startTime < fromDate || startTime > toDate) {
        return false;
      }
    }
    
    return true;
  }

  /**
 * Download a file's contents from Google Drive
 * @param {string} fileId - Google Drive file ID
 * @returns {Promise<string|null>} - File contents as string or null if error
 */
async downloadFileContents(fileId) {
  try {
    const response = await this.driveManager.drive.files.get({
      fileId: fileId,
      alt: 'media'
    });
    
    // Check if the response is already a string
    if (typeof response.data === 'string') {
      return response.data;
    }
    
    // Check if response.data is an object that was incorrectly serialized
    if (response.data && typeof response.data === 'object') {
      try {
        // Try to properly stringify the object
        return JSON.stringify(response.data);
      } catch (stringifyError) {
        console.error(`Error stringifying response data for file ${fileId}:`, stringifyError);
      }
    }
    
    // If all else fails, return null
    console.error(`Invalid response format for file ${fileId}:`, response.data);
    return null;
  } catch (error) {
    console.error(`Error downloading file ${fileId}:`, error);
    return null;
  }
}

  /**
   * Find screenshot files in Drive by time entry ID
   * @param {number} timeEntryId - Time entry ID
   * @returns {Promise<Array>} - Array of screenshot file objects
   */
  async findScreenshotsByTimeEntry(timeEntryId) {
    // Ensure we're initialized
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      console.log(`Finding screenshots for time entry ${timeEntryId} in Drive...`);
      
      // Search for files containing the time entry ID in their name
      const query = `name contains 'te_${timeEntryId}_'`;
      const screenshots = await this.driveManager.listFiles(
        this.driveManager.screenshotsFolderId,
        query
      );
      
      console.log(`Found ${screenshots.length} screenshots for time entry ${timeEntryId}`);
      
      // Enhance screenshot objects with extracted timestamp
      return screenshots.map(file => {
        // Extract timestamp from filename 
        // Format: screenshot_te_1234_2023-01-01T12-30-45.png
        const timestampMatch = file.name.match(/te_\d+_(\d+)/);
        const timestamp = timestampMatch ? parseInt(timestampMatch[1]) : 0;
        
        return {
          id: file.id,
          name: file.name,
          timeEntryId: timeEntryId,
          createdTime: file.createdTime,
          timestamp: timestamp ? new Date(timestamp).toISOString() : file.createdTime,
          fileType: 'image/png'
        };
      }).sort((a, b) => {
        // Sort by timestamp
        return new Date(a.timestamp) - new Date(b.timestamp);
      });
    } catch (error) {
      console.error(`Error finding screenshots for time entry ${timeEntryId}:`, error);
      return [];
    }
  }

  /**
   * Download a screenshot from Google Drive
   * @param {string} fileId - Google Drive file ID
   * @param {boolean} generateThumbnail - Whether to generate a thumbnail
   * @returns {Promise<Object>} - Object with buffer, base64, and thumbnail path
   */
  // Update in driveStore.js
async downloadScreenshot(fileId, generateThumbnail = true) {
  // Check cache first
  if (this.screenshotCache.has(fileId)) {
    console.log(`Using cached screenshot for ${fileId}`);
    return this.screenshotCache.get(fileId);
  }

  // Ensure we're initialized
  if (!this.initialized) {
    await this.initialize();
  }
  
  try {
    console.log(`Downloading screenshot ${fileId} from Drive...`);
    
    // Download the file as a buffer - add more detailed logging
    console.log(`Making API request to Google Drive for file ${fileId}`);
    
    // Use a timeout to prevent indefinite waiting
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Request timed out after 30 seconds')), 30000)
    );
    
    const fetchPromise = this.driveManager.drive.files.get({
      fileId: fileId,
      alt: 'media'
    }, {
      responseType: 'arraybuffer'
    });
    
    const response = await Promise.race([fetchPromise, timeoutPromise]);
    console.log(`Received response from Google Drive for file ${fileId}`);
    
    // Convert to buffer
    const buffer = Buffer.from(response.data);
    console.log(`Converted response to buffer, size: ${buffer.length} bytes`);
    
    // Convert to base64 for web display
    const base64 = buffer.toString('base64');
    console.log(`Converted buffer to base64 string, length: ${base64.length} chars`);
    
    // Generate thumbnail if requested
    let thumbnailPath = null;
    if (generateThumbnail) {
      thumbnailPath = await this.generateThumbnail(fileId, buffer);
      console.log(`Generated thumbnail at path: ${thumbnailPath}`);
    }
    
    // Create result object
    const result = {
      buffer,
      base64,
      thumbnailPath
    };
    
    // Add to cache
    this.addToScreenshotCache(fileId, result);
    console.log(`Added screenshot ${fileId} to cache`);
    
    return result;
  } catch (error) {
    console.error(`Error downloading screenshot ${fileId}:`, error);
    // Return a placeholder or error indicator
    return {
      buffer: null,
      base64: null,
      thumbnailPath: null,
      error: error.message
    };
  }
}

  /**
   * Generate a thumbnail from a screenshot
   * @param {string} fileId - File ID (used for naming)
   * @param {Buffer} buffer - Image buffer
   * @returns {Promise<string|null>} - Path to the thumbnail or null if failed
   */
  async generateThumbnail(fileId, buffer) {
    try {
      // Use filename as thumbnail name
      const thumbnailFilePath = path.join(this.thumbnailPath, `${fileId}_thumb.png`);
      
      // Check if thumbnail already exists
      if (fs.existsSync(thumbnailFilePath)) {
        return thumbnailFilePath;
      }
      
      // For now, just use the original image as the thumbnail
      // In a production app, you'd use sharp or another image processing library
      // to resize the image here
      fs.writeFileSync(thumbnailFilePath, buffer);
      
      return thumbnailFilePath;
    } catch (error) {
      console.error(`Error generating thumbnail for ${fileId}:`, error);
      return null;
    }
  }

  /**
   * Add a screenshot to the cache
   * @param {string} fileId - Google Drive file ID
   * @param {Object} data - Screenshot data
   */
  addToScreenshotCache(fileId, data) {
    // Check if cache is full
    if (this.screenshotCache.size >= this.maxCacheSize) {
      // Remove oldest entry (first key in map)
      const oldestKey = this.screenshotCache.keys().next().value;
      this.screenshotCache.delete(oldestKey);
    }
    
    // Add to cache
    this.screenshotCache.set(fileId, data);
  }

  /**
   * Clear the screenshot cache
   */
  clearScreenshotCache() {
    this.screenshotCache.clear();
    console.log('Screenshot cache cleared');
  }

  /**
   * Check if a time entry exists in Drive
   * @param {number} timeEntryId - Time entry ID
   * @returns {Promise<boolean>} - True if the time entry exists in Drive
   */
  async checkTimeEntryExistsInDrive(timeEntryId) {
    // Ensure we're initialized
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      // Search for time entry file by name pattern
      const query = `name contains 'time_entry_${timeEntryId}_'`;
      const files = await this.driveManager.listFiles(
        this.driveManager.timeEntriesFolderId,
        query
      );
      
      return files.length > 0;
    } catch (error) {
      console.error(`Error checking if time entry ${timeEntryId} exists in Drive:`, error);
      return false;
    }
  }

  /**
   * Get screenshot thumbnails by time entry ID
   * @param {number} timeEntryId - Time entry ID
   * @returns {Promise<Array>} - Array of screenshot objects with thumbnail paths
   */
  async getScreenshotThumbnails(timeEntryId) {
    try {
      // Find screenshots in Drive
      const screenshots = await this.findScreenshotsByTimeEntry(timeEntryId);
      
      // Get thumbnails for each screenshot
      const results = [];
      for (const screenshot of screenshots) {
        // Check if thumbnail already exists
        const thumbnailPath = path.join(this.thumbnailPath, `${screenshot.id}_thumb.png`);
        
        if (fs.existsSync(thumbnailPath)) {
          // Add existing thumbnail
          results.push({
            ...screenshot,
            thumbnailPath
          });
        } else {
          // Download screenshot and generate thumbnail
          const screenshotData = await this.downloadScreenshot(screenshot.id, true);
          
          if (screenshotData) {
            results.push({
              ...screenshot,
              thumbnailPath: screenshotData.thumbnailPath
            });
          }
        }
      }
      
      return results;
    } catch (error) {
      console.error(`Error getting screenshot thumbnails for time entry ${timeEntryId}:`, error);
      return [];
    }
  }
}

// Export a singleton instance
const driveStore = new DriveStore();
module.exports = driveStore;