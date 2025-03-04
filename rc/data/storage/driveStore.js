// Google Drive Storage Manager for Time Tracker App
// Path: src/data/storage/driveStore.js

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { app } = require('electron');
const dbManager = require('../db/dbManager');

class DriveStore {
  constructor() {
    this.drive = null;
    this.initialized = false;
    this.syncInterval = null;
    
    // 1-year retention period in milliseconds
    this.retentionPeriod = 365 * 24 * 60 * 60 * 1000;
    
    // Default folder names in Google Drive
    this.rootFolderName = 'TimeTrackerData';
    this.timeEntriesFolderName = 'TimeEntries';
    this.screenshotsFolderName = 'Screenshots';
    
    // Folder IDs (populated during initialization)
    this.rootFolderId = null;
    this.timeEntriesFolderId = null;
    this.screenshotsFolderId = null;
  }

  /**
   * Initialize Google Drive connection using service account credentials
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Load service account credentials
      let credentials;
      
      try {
        // First, try to load from app config
        const userDataPath = app.getPath('userData');
        const credsPath = path.join(userDataPath, 'config', 'serviceAccount.json');
        
        if (fs.existsSync(credsPath)) {
          const credsContent = fs.readFileSync(credsPath, 'utf8');
          credentials = JSON.parse(credsContent);
        } else {
          // If not found, try to load from bundled app resources
          const appPath = app.getAppPath();
          const bundledCredsPath = path.join(appPath, 'config', 'serviceAccount.json');
          
          if (fs.existsSync(bundledCredsPath)) {
            const credsContent = fs.readFileSync(bundledCredsPath, 'utf8');
            credentials = JSON.parse(credsContent);
          } else {
            throw new Error('Service account credentials not found');
          }
        }
      } catch (error) {
        console.error('Error loading credentials:', error);
        throw new Error('Failed to load service account credentials');
      }
      
      // Create JWT client
      const auth = new google.auth.JWT(
        credentials.client_email,
        null,
        credentials.private_key,
        ['https://www.googleapis.com/auth/drive']
      );
      
      // Initialize Google Drive API
      this.drive = google.drive({ version: 'v3', auth });
      
      // Create or find necessary folders
      await this.setupFolders();
      
      console.log('Google Drive connection initialized successfully');
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize Google Drive connection:', error);
      throw error;
    }
  }

  /**
   * Create or find folders in Google Drive
   */
  async setupFolders() {
    try {
      // Find or create root folder
      this.rootFolderId = await this.findOrCreateFolder(this.rootFolderName, null);
      
      // Find or create time entries folder
      this.timeEntriesFolderId = await this.findOrCreateFolder(
        this.timeEntriesFolderName, 
        this.rootFolderId
      );
      
      // Find or create screenshots folder
      this.screenshotsFolderId = await this.findOrCreateFolder(
        this.screenshotsFolderName, 
        this.rootFolderId
      );
      
      console.log('Drive folders set up successfully');
    } catch (error) {
      console.error('Error setting up folders:', error);
      throw error;
    }
  }

  /**
   * Find a folder by name, or create it if it doesn't exist
   * @param {string} folderName - The folder name
   * @param {string|null} parentId - The parent folder ID (null for root)
   * @returns {string} - The folder ID
   */
  async findOrCreateFolder(folderName, parentId) {
    try {
      // Try to find existing folder
      let query = `mimeType='application/vnd.google-apps.folder' and name='${folderName}'`;
      
      if (parentId) {
        query += ` and '${parentId}' in parents`;
      }
      
      const response = await this.drive.files.list({
        q: query,
        fields: 'files(id)',
        spaces: 'drive'
      });
      
      // If folder exists, return its ID
      if (response.data.files.length > 0) {
        return response.data.files[0].id;
      }
      
      // Otherwise, create the folder
      const fileMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder'
      };
      
      if (parentId) {
        fileMetadata.parents = [parentId];
      }
      
      const folder = await this.drive.files.create({
        resource: fileMetadata,
        fields: 'id'
      });
      
      return folder.data.id;
    } catch (error) {
      console.error(`Error finding/creating folder ${folderName}:`, error);
      throw error;
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
    
    // Start a new sync interval
    this.syncInterval = setInterval(() => {
      this.syncPendingData()
        .catch(error => console.error('Auto-sync error:', error));
    }, interval);
    
    console.log(`Auto-sync started with ${intervalMinutes} minute interval`);
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
   */
  async syncPendingData() {
    // Ensure Drive connection is initialized
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      console.log('Starting sync process...');
      
      // Get pending time entries
      const pendingTimeEntries = await this.getPendingTimeEntries();
      console.log(`Found ${pendingTimeEntries.length} pending time entries`);
      
      // Sync time entries
      for (const entry of pendingTimeEntries) {
        await this.syncTimeEntry(entry);
      }
      
      // Get pending screenshots
      const pendingScreenshots = await this.getPendingScreenshots();
      console.log(`Found ${pendingScreenshots.length} pending screenshots`);
      
      // Sync screenshots
      for (const screenshot of pendingScreenshots) {
        await this.syncScreenshot(screenshot);
      }
      
      // Clean up old data in Google Drive
      await this.cleanupOldData();
      
      console.log('Sync process completed successfully');
      return {
        timeEntries: pendingTimeEntries.length,
        screenshots: pendingScreenshots.length
      };
    } catch (error) {
      console.error('Sync process failed:', error);
      throw error;
    }
  }

  /**
   * Get pending time entries for sync
   * @returns {Array} - Array of time entry records
   */
  async getPendingTimeEntries() {
    dbManager.initialize();
    
    const query = `
      SELECT t.* 
      FROM time_entries t
      JOIN sync_status s ON s.entity_id = t.id AND s.entity_type = 'time_entry'
      WHERE s.is_synced = 0
    `;
    
    return dbManager.runQuery(query);
  }

  /**
   * Get pending screenshots for sync
   * @returns {Array} - Array of screenshot records
   */
  async getPendingScreenshots() {
    dbManager.initialize();
    
    const query = `
      SELECT s.* 
      FROM screenshots s
      JOIN sync_status ss ON ss.entity_id = s.id AND ss.entity_type = 'screenshot'
      WHERE ss.is_synced = 0
    `;
    
    return dbManager.runQuery(query);
  }

  /**
   * Sync a time entry to Google Drive
   * @param {Object} timeEntry - The time entry record
   */
  async syncTimeEntry(timeEntry) {
    try {
      // Convert time entry to JSON
      const timeEntryJson = JSON.stringify(timeEntry);
      
      // Create file name based on entry ID and date
      const fileName = `time_entry_${timeEntry.id}_${new Date().toISOString()}.json`;
      
      // Upload to Google Drive
      await this.uploadFile(
        fileName,
        'application/json',
        Buffer.from(timeEntryJson),
        this.timeEntriesFolderId
      );
      
      // Mark as synced
      await this.markAsSynced('time_entry', timeEntry.id);
      
      console.log(`Time entry ${timeEntry.id} synced successfully`);
    } catch (error) {
      console.error(`Error syncing time entry ${timeEntry.id}:`, error);
      
      // Update sync status with error
      await this.updateSyncStatus('time_entry', timeEntry.id, error.message);
      throw error;
    }
  }

  /**
   * Sync a screenshot to Google Drive
   * @param {Object} screenshot - The screenshot record
   */
  async syncScreenshot(screenshot) {
    try {
      // Check if file exists
      if (!fs.existsSync(screenshot.filepath)) {
        throw new Error('Screenshot file not found');
      }
      
      // Read file
      const fileData = fs.readFileSync(screenshot.filepath);
      
      // Get file name from path
      const fileName = path.basename(screenshot.filepath);
      
      // Upload to Google Drive
      await this.uploadFile(
        fileName,
        'image/png',
        fileData,
        this.screenshotsFolderId
      );
      
      // Mark as synced
      await this.markAsSynced('screenshot', screenshot.id);
      
      console.log(`Screenshot ${screenshot.id} synced successfully`);
    } catch (error) {
      console.error(`Error syncing screenshot ${screenshot.id}:`, error);
      
      // Update sync status with error
      await this.updateSyncStatus('screenshot', screenshot.id, error.message);
      throw error;
    }
  }

  /**
   * Upload a file to Google Drive
   * @param {string} name - File name
   * @param {string} mimeType - File MIME type
   * @param {Buffer} data - File data
   * @param {string} folderId - Parent folder ID
   * @returns {string} - The new file ID
   */
  async uploadFile(name, mimeType, data, folderId) {
    try {
      const fileMetadata = {
        name: name,
        parents: [folderId]
      };
      
      const media = {
        mimeType: mimeType,
        body: Buffer.from(data)
      };
      
      const response = await this.drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id'
      });
      
      return response.data.id;
    } catch (error) {
      console.error(`Error uploading file ${name}:`, error);
      throw error;
    }
  }

  /**
   * Mark an entity as synced
   * @param {string} entityType - Entity type ('time_entry' or 'screenshot')
   * @param {number} entityId - Entity ID
   */
  async markAsSynced(entityType, entityId) {
    dbManager.initialize();
    
    const query = `
      UPDATE sync_status 
      SET is_synced = 1, last_sync_attempt = ?
      WHERE entity_type = ? AND entity_id = ?
    `;
    
    await dbManager.runQuery(query, [new Date().toISOString(), entityType, entityId]);
  }

  /**
   * Update sync status with error
   * @param {string} entityType - Entity type ('time_entry' or 'screenshot')
   * @param {number} entityId - Entity ID
   * @param {string} error - Error message
   */
  async updateSyncStatus(entityType, entityId, error) {
    dbManager.initialize();
    
    const query = `
      UPDATE sync_status 
      SET last_sync_attempt = ?, sync_error = ?
      WHERE entity_type = ? AND entity_id = ?
    `;
    
    await dbManager.runQuery(query, [
      new Date().toISOString(), 
      error, 
      entityType, 
      entityId
    ]);
  }

  /**
   * Clean up old data from Google Drive based on retention policy
   */
  async cleanupOldData() {
    try {
      // Calculate cutoff date (1 year ago)
      const cutoffDate = new Date();
      cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);
      
      // Format as RFC 3339 timestamp
      const cutoffDateString = cutoffDate.toISOString();
      
      // Find files older than the cutoff date
      const query = `
        (mimeType='application/json' or mimeType='image/png') and 
        (parents='${this.timeEntriesFolderId}' or parents='${this.screenshotsFolderId}') and
        createdTime<'${cutoffDateString}'
      `;
      
      const response = await this.drive.files.list({
        q: query,
        fields: 'files(id, name)',
        spaces: 'drive'
      });
      
      // Delete old files
      const oldFiles = response.data.files;
      console.log(`Found ${oldFiles.length} files to delete based on retention policy`);
      
      for (const file of oldFiles) {
        await this.drive.files.delete({ fileId: file.id });
        console.log(`Deleted old file: ${file.name}`);
      }
      
      console.log('Cleanup completed successfully');
      return oldFiles.length;
    } catch (error) {
      console.error('Error during cleanup:', error);
      throw error;
    }
  }
}

// Export a singleton instance
const driveStore = new DriveStore();
module.exports = driveStore;