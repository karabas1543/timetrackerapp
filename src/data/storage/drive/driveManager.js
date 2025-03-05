// Google Drive Manager for Time Tracker App
// Path: src/data/storage/drive/driveManager.js

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { app } = require('electron');

class DriveManager {
  constructor() {
    this.drive = null;
    this.initialized = false;
    
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
   * @returns {Promise<boolean>} - Success status
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
      return true;
    } catch (error) {
      console.error('Failed to initialize Google Drive connection:', error);
      return false;
    }
  }

  /**
   * Load service account credentials from file
   * @returns {Promise<Object>} - Service account credentials
   * @private
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
   * @returns {Promise<void>}
   * @private
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
   * @returns {Promise<string>} - The folder ID
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
   * Upload a file to Google Drive
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
   * Delete a file from Google Drive
   * @param {string} fileId - The file ID to delete
   * @returns {Promise<boolean>} - Success status
   */
  async deleteFile(fileId) {
    try {
      await this.drive.files.delete({ fileId });
      return true;
    } catch (error) {
      console.error(`Error deleting file ${fileId}:`, error);
      return false;
    }
  }
  
  /**
   * List files in a folder with optional query parameters
   * @param {string} folderId - The folder ID to list files from
   * @param {string} [additionalQuery] - Additional query parameters
   * @returns {Promise<Array>} - Array of file objects
   */
  async listFiles(folderId, additionalQuery = '') {
    try {
      let query = `'${folderId}' in parents and trashed=false`;
      
      if (additionalQuery) {
        query += ` and ${additionalQuery}`;
      }
      
      const response = await this.drive.files.list({
        q: query,
        fields: 'files(id, name, createdTime, modifiedTime)',
        spaces: 'drive'
      });
      
      return response.data.files || [];
    } catch (error) {
      console.error(`Error listing files in folder ${folderId}:`, error);
      return [];
    }
  }
}

module.exports = DriveManager;