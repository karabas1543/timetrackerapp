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
    
    // 1-year retention period in milliseconds (365 days)
    this.retentionPeriod = 365 * 24 * 60 * 60 * 1000;
    
    // Default folder names in Google Drive
    this.rootFolderName = 'TimeTrackerData';
    this.timeEntriesFolderName = 'TimeEntries';
    this.screenshotsFolderName = 'Screenshots';
    
    // Folder IDs (populated during initialization)
    this.rootFolderId = null;
    this.timeEntriesFolderId = null;
    this.screenshotsFolderId = null;

    // Track last sync time
    this.lastSyncTime = null;
  }

  /**
   * Initialize Google Drive connection using service account credentials
   */
  async initialize() {
    if (this.initialized) return true;

    try {
      console.log('Initializing Google Drive connection...');
      
      // Load service account credentials
      const credentials = await this.loadCredentials();
      
      // Create JWT client
      const auth = new google.auth.JWT(
        credentials.client_email,
        null,
        credentials.private_key,
        ['https://www.googleapis.com/auth/drive']
      );
      
      // Initialize Google Drive API
      this.drive = google.drive({ version: 'v3', auth });
      
      // Test authentication
      await auth.authorize();
      console.log('Google Drive authentication successful');
      
      // Create or find necessary folders
      await this.setupFolders();
      
      console.log('Google Drive connection initialized successfully');
      this.initialized = true;
      this.lastSyncTime = Date.now();

      return true;
    } catch (error) {
      console.error('Failed to initialize Google Drive connection:', error);
      return false;
    }
  }

  /**
   * Load service account credentials from file
   * @returns {Object} - Service account credentials
   */
  async loadCredentials() {
    return new Promise((resolve, reject) => {
      try {
        // Try to load from app config directory first
        const userDataPath = app.getPath('userData');
        const configPath = path.join(userDataPath, 'config');
        const userCredsPath = path.join(configPath, 'serviceAccount.json');
        
        // Then try from the app's config directory
        const appPath = app.getAppPath();
        const appCredsPath = path.join(appPath, 'config', 'serviceAccount.json');
        
        // Log the paths we're checking
        console.log('Looking for credentials in userDataPath:', userCredsPath);
        console.log('Looking for credentials in appPath:', appCredsPath);
        console.log('Directory contents of app config folder:');
        
        try {
          const configDir = path.join(appPath, 'config');
          if (fs.existsSync(configDir)) {
            const files = fs.readdirSync(configDir);
            console.log(files);
          } else {
            console.log('Config directory does not exist:', configDir);
          }
        } catch (error) {
          console.error('Error reading config directory:', error);
        }
        
        // Check user data path first
        if (fs.existsSync(userCredsPath)) {
          console.log('Loading credentials from user data path:', userCredsPath);
          const credsContent = fs.readFileSync(userCredsPath, 'utf8');
          resolve(JSON.parse(credsContent));
        } 
        // Then check app directory
        else if (fs.existsSync(appCredsPath)) {
          console.log('Loading credentials from app path:', appCredsPath);
          const credsContent = fs.readFileSync(appCredsPath, 'utf8');
          resolve(JSON.parse(credsContent));
        } 
        else {
          reject(new Error('Service account credentials not found. Please place your serviceAccount.json file in the config folder.'));
        }
      } catch (error) {
        console.error('Error loading credentials:', error);
        reject(new Error('Failed to load service account credentials: ' + error.message));
      }
    });
  }

  /**
   * Create or find folders in Google Drive
   */
  async setupFolders() {
    try {
      console.log('Setting up Google Drive folders...');
      
      // Find or create root folder
      this.rootFolderId = await this.findOrCreateFolder(this.rootFolderName, null);
      console.log('Root folder ID:', this.rootFolderId);
      
      // Find or create time entries folder
      this.timeEntriesFolderId = await this.findOrCreateFolder(
        this.timeEntriesFolderName, 
        this.rootFolderId
      );
      console.log('Time entries folder ID:', this.timeEntriesFolderId);
      
      // Find or create screenshots folder
      this.screenshotsFolderId = await this.findOrCreateFolder(
        this.screenshotsFolderName, 
        this.rootFolderId
      );
      console.log('Screenshots folder ID:', this.screenshotsFolderId);
      
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
        fields: 'files(id, name)',
        spaces: 'drive'
      });
      
      // If folder exists, return its ID
      if (response.data.files.length > 0) {
        console.log(`Found existing folder: ${folderName} (${response.data.files[0].id})`);
        return response.data.files[0].id;
      }
      
      // Otherwise, create the folder
      console.log(`Creating new folder: ${folderName}`);
      
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
      
      console.log(`Created new folder: ${folderName} (${folder.data.id})`);
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
      
      // Get pending time entries
      const pendingTimeEntries = await this.getPendingTimeEntries();
      console.log(`Found ${pendingTimeEntries.length} pending time entries`);
      
      // Sync time entries
      let syncedTimeEntries = 0;
      for (const entry of pendingTimeEntries) {
        try {
          await this.syncTimeEntry(entry);
          syncedTimeEntries++;
        } catch (error) {
          console.error(`Error syncing time entry ${entry.id}:`, error);
        }
      }
      
      // Get pending screenshots
      const pendingScreenshots = await this.getPendingScreenshots();
      console.log(`Found ${pendingScreenshots.length} pending screenshots`);
      
      // Sync screenshots
      let syncedScreenshots = 0;
      for (const screenshot of pendingScreenshots) {
        try {
          await this.syncScreenshot(screenshot);
          syncedScreenshots++;
        } catch (error) {
          console.error(`Error syncing screenshot ${screenshot.id}:`, error);
        }
      }
      
      // Clean up old data in Google Drive
      const deletedFiles = await this.cleanupOldData();
      
      // Update last sync time
      this.lastSyncTime = Date.now();
      
      console.log(`Sync process completed successfully. Synced ${syncedTimeEntries}/${pendingTimeEntries.length} time entries and ${syncedScreenshots}/${pendingScreenshots.length} screenshots. Deleted ${deletedFiles} old files.`);
      
      return {
        timeEntries: {
          pending: pendingTimeEntries.length,
          synced: syncedTimeEntries
        },
        screenshots: {
          pending: pendingScreenshots.length,
          synced: syncedScreenshots
        },
        deletedFiles: deletedFiles
      };
    } catch (error) {
      console.error('Sync process failed:', error);
      throw error;
    }
  }

  /**
   * Get pending time entries for sync
   * @returns {Promise<Array>} - Array of time entry records
   */
  async getPendingTimeEntries() {
    try {
      dbManager.initialize();
      
      const query = `
        SELECT t.* 
        FROM time_entries t
        JOIN sync_status s ON s.entity_id = t.id AND s.entity_type = 'time_entry'
        WHERE s.is_synced = 0
        ORDER BY t.start_time ASC
        LIMIT 50
      `;
      
      return await dbManager.runQuery(query);
    } catch (error) {
      console.error('Error getting pending time entries:', error);
      return [];
    }
  }

  /**
   * Get pending screenshots for sync
   * @returns {Promise<Array>} - Array of screenshot records
   */
  async getPendingScreenshots() {
    try {
      dbManager.initialize();
      
      const query = `
        SELECT s.* 
        FROM screenshots s
        JOIN sync_status ss ON ss.entity_id = s.id AND ss.entity_type = 'screenshot'
        WHERE ss.is_synced = 0 AND s.is_deleted = 0
        ORDER BY s.timestamp ASC
        LIMIT 50
      `;
      
      return await dbManager.runQuery(query);
    } catch (error) {
      console.error('Error getting pending screenshots:', error);
      return [];
    }
  }

  /**
   * Sync a time entry to Google Drive
   * @param {Object} timeEntry - The time entry record
   */
  async syncTimeEntry(timeEntry) {
    try {
      console.log(`Syncing time entry ${timeEntry.id}...`);

      // Enrich time entry with related data
      const enrichedEntry = await this.enrichTimeEntry(timeEntry);
      
      // Convert time entry to JSON
      const timeEntryJson = JSON.stringify(enrichedEntry, null, 2);
      
      // Create file name based on entry ID and date
      const fileName = `time_entry_${timeEntry.id}_${new Date(timeEntry.start_time).toISOString().split('T')[0]}.json`;
      
      // Upload to Google Drive
      const fileId = await this.uploadFile(
        fileName,
        'application/json',
        Buffer.from(timeEntryJson),
        this.timeEntriesFolderId
      );
      
      // Mark as synced
      await this.markAsSynced('time_entry', timeEntry.id);
      
      console.log(`Time entry ${timeEntry.id} synced successfully as file ${fileName} (ID: ${fileId})`);
    } catch (error) {
      console.error(`Error syncing time entry ${timeEntry.id}:`, error);
      
      // Update sync status with error
      await this.updateSyncStatus('time_entry', timeEntry.id, error.message);
      throw error;
    }
  }

  /**
   * Enrich a time entry with related data
   * @param {Object} timeEntry - The time entry record
   * @returns {Promise<Object>} - Enriched time entry
   */
  async enrichTimeEntry(timeEntry) {
    try {
      dbManager.initialize();
      
      // Get related user info
      const userQuery = 'SELECT id, username FROM users WHERE id = ?';
      const users = await dbManager.runQuery(userQuery, [timeEntry.user_id]);
      const user = users.length > 0 ? users[0] : { id: timeEntry.user_id, username: 'Unknown' };
      
      // Get related client info
      const clientQuery = 'SELECT id, name FROM clients WHERE id = ?';
      const clients = await dbManager.runQuery(clientQuery, [timeEntry.client_id]);
      const client = clients.length > 0 ? clients[0] : { id: timeEntry.client_id, name: 'Unknown' };
      
      // Get related project info
      const projectQuery = 'SELECT id, name FROM projects WHERE id = ?';
      const projects = await dbManager.runQuery(projectQuery, [timeEntry.project_id]);
      const project = projects.length > 0 ? projects[0] : { id: timeEntry.project_id, name: 'Unknown' };
      
      // Get screenshot count
      const screenshotQuery = 'SELECT COUNT(*) as count FROM screenshots WHERE time_entry_id = ? AND is_deleted = 0';
      const screenshotResults = await dbManager.runQuery(screenshotQuery, [timeEntry.id]);
      const screenshotCount = screenshotResults.length > 0 ? screenshotResults[0].count : 0;
      
      // Create enriched object
      return {
        ...timeEntry,
        user: {
          id: user.id,
          username: user.username
        },
        client: {
          id: client.id,
          name: client.name
        },
        project: {
          id: project.id,
          name: project.name
        },
        screenshots: {
          count: screenshotCount
        },
        metadata: {
          sync_time: new Date().toISOString(),
          app_version: app.getVersion ? app.getVersion() : 'unknown'
        }
      };
    } catch (error) {
      console.error('Error enriching time entry:', error);
      return timeEntry; // Return original if enrichment fails
    }
  }

  /**
   * Sync a screenshot to Google Drive
   * @param {Object} screenshot - The screenshot record
   */
  async syncScreenshot(screenshot) {
    try {
      console.log(`Syncing screenshot ${screenshot.id}...`);
      
      // Check if file exists
      if (!fs.existsSync(screenshot.filepath)) {
        throw new Error('Screenshot file not found at path: ' + screenshot.filepath);
      }
      
      // Read file
      const fileData = fs.readFileSync(screenshot.filepath);
      
      // Get time entry ID for the filename
      const timeEntryId = screenshot.time_entry_id;
      
      // Format timestamp for filename
      const timestamp = new Date(screenshot.timestamp)
        .toISOString()
        .replace(/:/g, '-') // Replace colons with dashes for valid filenames
        .replace(/\..+$/, ''); // Remove milliseconds
      
      // Create filename
      const fileName = `screenshot_te_${timeEntryId}_${timestamp}.png`;
      
      // Upload to Google Drive
      const fileId = await this.uploadFile(
        fileName,
        'image/png',
        fileData,
        this.screenshotsFolderId
      );
      
      // Mark as synced
      await this.markAsSynced('screenshot', screenshot.id);
      
      console.log(`Screenshot ${screenshot.id} synced successfully as file ${fileName} (ID: ${fileId})`);
    } catch (error) {
      console.error(`Error syncing screenshot ${screenshot.id}:`, error);
      
      // Update sync status with error
      await this.updateSyncStatus('screenshot', screenshot.id, error.message);
      throw error;
    }
  }

 /**
 * Upload a file to Google Drive with better binary handling
 * @param {string} name - File name
 * @param {string} mimeType - File MIME type
 * @param {Buffer} data - File data
 * @param {string} folderId - Parent folder ID
 * @returns {Promise<string>} - The new file ID
 */
async uploadFile(name, mimeType, data, folderId) {
    try {
      // Check if a file with this name already exists in the folder
      const existingFile = await this.findFileByName(name, folderId);
      
      // Special handling based on whether it's binary or text data
      const isJSON = mimeType === 'application/json';
      
      // Convert binary buffer to stream for Google Drive upload
      // This is crucial for image uploads to work properly
      let mediaBody;
      if (isJSON) {
        // For JSON, convert to string
        mediaBody = data.toString('utf8');
      } else {
        // For binary data, use the raw buffer data
        // This creates a data URL format that Drive API can handle
        const base64Data = data.toString('base64');
        mediaBody = base64Data;
      }
      
      if (existingFile) {
        // Update the existing file
        console.log(`File ${name} already exists, updating content...`);
        
        const response = await this.drive.files.update({
          fileId: existingFile.id,
          media: {
            mimeType: mimeType,
            body: mediaBody
          }
        });
        
        console.log(`Updated existing file: ${name}`);
        return existingFile.id;
      } else {
        // Create a new file
        console.log(`Creating new file: ${name}`);
        
        // Create file metadata
        const fileMetadata = {
          name: name,
          parents: [folderId]
        };
        
        // Use the Drive API's simple upload for better reliability with binary data
        const response = await this.drive.files.create({
          requestBody: fileMetadata,
          media: {
            mimeType: mimeType,
            body: mediaBody
          },
          fields: 'id'
        });
        
        const fileId = response.data.id;
        console.log(`Created new file: ${name} with ID: ${fileId}`);
        
        // Make the file visible to anyone with the link
        try {
          await this.drive.permissions.create({
            fileId: fileId,
            requestBody: {
              role: 'reader',
              type: 'anyone',
              allowFileDiscovery: false
            }
          });
          console.log(`Set sharing permissions for file ${name}`);
        } catch (permError) {
          console.error(`Error setting permissions for file ${name}:`, permError);
          // Continue even if permission setting fails
        }
        
        return fileId;
      }
    } catch (error) {
      console.error(`Error uploading file ${name}:`, error);
      throw error;
    }
  }
  
  /**
   * Find a file by name in a specific folder
   * @param {string} name - File name
   * @param {string} folderId - Parent folder ID
   * @returns {Promise<Object|null>} - File object or null if not found
   */
  async findFileByName(name, folderId) {
    try {
      const query = `name='${name}' and '${folderId}' in parents and trashed=false`;
      
      const response = await this.drive.files.list({
        q: query,
        fields: 'files(id, name)',
        spaces: 'drive'
      });
      
      if (response.data.files.length > 0) {
        return response.data.files[0];
      }
      
      return null;
    } catch (error) {
      console.error(`Error finding file ${name}:`, error);
      return null;
    }
  }

  /**
   * Mark an entity as synced
   * @param {string} entityType - Entity type ('time_entry' or 'screenshot')
   * @param {number} entityId - Entity ID
   */
  async markAsSynced(entityType, entityId) {
    try {
      dbManager.initialize();
      
      const query = `
        UPDATE sync_status 
        SET is_synced = 1, last_sync_attempt = ?, sync_error = NULL
        WHERE entity_type = ? AND entity_id = ?
      `;
      
      await dbManager.runQuery(query, [new Date().toISOString(), entityType, entityId]);
    } catch (error) {
      console.error(`Error marking ${entityType} ${entityId} as synced:`, error);
      throw error;
    }
  }

  /**
   * Update sync status with error
   * @param {string} entityType - Entity type ('time_entry' or 'screenshot')
   * @param {number} entityId - Entity ID
   * @param {string} error - Error message
   */
  async updateSyncStatus(entityType, entityId, error) {
    try {
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
    } catch (error) {
      console.error(`Error updating sync status for ${entityType} ${entityId}:`, error);
    }
  }

  /**
   * Clean up old data from Google Drive based on retention policy
   * @returns {Promise<number>} - Number of files deleted
   */
  async cleanupOldData() {
    try {
      // Calculate cutoff date (1 year ago)
      const cutoffDate = new Date(Date.now() - this.retentionPeriod);
      
      // Format as RFC 3339 timestamp
      const cutoffDateString = cutoffDate.toISOString();
      
      console.log(`Cleaning up files created before ${cutoffDateString}`);
      
      // Find files older than the cutoff date
      const query = `
        (parents='${this.timeEntriesFolderId}' or parents='${this.screenshotsFolderId}') and
        createdTime<'${cutoffDateString}'
      `;
      
      const response = await this.drive.files.list({
        q: query,
        fields: 'files(id, name, createdTime)',
        spaces: 'drive'
      });
      
      // Delete old files
      const oldFiles = response.data.files;
      console.log(`Found ${oldFiles.length} files to delete based on retention policy`);
      
      let deletedCount = 0;
      for (const file of oldFiles) {
        try {
          await this.drive.files.delete({ fileId: file.id });
          console.log(`Deleted old file: ${file.name} (created: ${file.createdTime})`);
          deletedCount++;
        } catch (error) {
          console.error(`Error deleting file ${file.name}:`, error);
        }
      }
      
      console.log(`Cleanup completed successfully, deleted ${deletedCount} files`);
      return deletedCount;
    } catch (error) {
      console.error('Error during cleanup:', error);
      return 0;
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
   * Get sync status summary
   * @returns {Promise<Object>} - Sync status summary
   */
  async getSyncStatus() {
    try {
      dbManager.initialize();
      
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
}

// Create and export the DriveStore instance
const driveStore = new DriveStore();
module.exports = driveStore;