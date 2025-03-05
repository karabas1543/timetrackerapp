// Screenshot Model for Time Tracker App
// Path: src/data/models/screenshot.js

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const dbManager = require('../db/dbManager');

class Screenshot {
  /**
   * Create a new Screenshot instance
   * @param {Object} data - Screenshot data
   */
  constructor(data = {}) {
    this.id = data.id || null;
    this.time_entry_id = data.time_entry_id || null;
    this.filepath = data.filepath || '';
    this.timestamp = data.timestamp || null;
    this.is_deleted = data.is_deleted || 0;
    this.created_at = data.created_at || null;
  }

  /**
   * Save the screenshot to the database (create or update)
   * @returns {Promise<Screenshot>} - The screenshot instance
   */
  async save() {
    // Validate required fields
    if (!this.time_entry_id || !this.filepath) {
      throw new Error('Screenshot requires time_entry_id and filepath');
    }

    const screenshotData = {
      time_entry_id: this.time_entry_id,
      filepath: this.filepath,
      timestamp: this.timestamp || new Date().toISOString(),
      is_deleted: this.is_deleted
    };

    // Save screenshot and add to sync queue in a single transaction
    await dbManager.withTransaction(async () => {
      if (this.id) {
        // Update existing screenshot
        await dbManager.update('screenshots', this.id, screenshotData);
      } else {
        // Create new screenshot
        this.id = await dbManager.insert('screenshots', screenshotData);
        
        // Add to sync queue in the same transaction
        await this.addToSyncQueueInternal();
      }
    });

    return this;
  }

  /**
   * Internal method to add screenshot to sync queue (used within transactions)
   * @returns {Promise<void>}
   * @private
   */
  async addToSyncQueueInternal() {
    if (!this.id) return;
    
    // Check if entry already exists in sync_status
    const checkQuery = 'SELECT * FROM sync_status WHERE entity_type = ? AND entity_id = ?';
    const existing = await dbManager.runQuery(checkQuery, ['screenshot', this.id]);
    
    if (existing && existing.length > 0) {
      console.log(`Screenshot ${this.id} already in sync queue`);
      return;
    }
    
    // Add new sync status record
    const syncData = {
      entity_type: 'screenshot',
      entity_id: this.id,
      is_synced: 0,
      last_sync_attempt: null
    };
    
    await dbManager.insert('sync_status', syncData);
    console.log(`Added screenshot ${this.id} to sync queue`);
  }

  /**
   * Add this screenshot to the sync queue (public method for external use)
   * @returns {Promise<void>}
   */
  async addToSyncQueue() {
    if (!this.id) return;

    try {
      await dbManager.withTransaction(async () => {
        await this.addToSyncQueueInternal();
      });
    } catch (error) {
      console.error(`Error adding screenshot ${this.id} to sync queue:`, error);
    }
  }

  /**
   * Create a new screenshot for a time entry
   * @param {number} timeEntryId - The time entry ID
   * @param {Buffer} imageData - The screenshot image data
   * @returns {Promise<Screenshot>} - The new screenshot instance
   */
  static async create(timeEntryId, imageData) {
    // Use the app name for the directory path instead of default Electron
    // This ensures screenshots go to Time Tracker folder rather than Electron
    const appName = 'Time Tracker';
    
    // Get the base user data path
    let userDataPath = app.getPath('userData');
    
    // Fix: If app is running from development (as Electron), modify the path
    // This is a workaround for development environment
    if (userDataPath.includes('Electron')) {
      userDataPath = userDataPath.replace('Electron', appName);
      // Ensure the directory exists
      if (!fs.existsSync(userDataPath)) {
        fs.mkdirSync(userDataPath, { recursive: true });
      }
    }
    
    // Create screenshots directory if it doesn't exist
    const screenshotsDir = path.join(userDataPath, 'screenshots');
    
    // Log path for debugging
    console.log('Saving screenshot to directory:', screenshotsDir);
    
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
    
    // Generate filename based on time entry ID and timestamp
    const timestamp = new Date();
    const filename = `te_${timeEntryId}_${timestamp.getTime()}.png`;
    const filepath = path.join(screenshotsDir, filename);
    
    // Save image to file
    fs.writeFileSync(filepath, imageData);
    
    // Create and save screenshot record
    const screenshot = new Screenshot({
      time_entry_id: timeEntryId,
      filepath: filepath,
      timestamp: timestamp.toISOString()
    });
    
    return await screenshot.save();
  }

  /**
   * Mark screenshot as deleted (without actually deleting the file)
   * @returns {Promise<Screenshot>} - The updated screenshot instance
   */
  async markAsDeleted() {
    this.is_deleted = 1;
    return await this.save();
  }

  /**
   * Get screenshot image data
   * @returns {Buffer|null} - Image data or null if not found
   */
  getImageData() {
    if (!this.filepath || !fs.existsSync(this.filepath)) {
      return null;
    }
    
    return fs.readFileSync(this.filepath);
  }

  /**
   * Get a screenshot by ID
   * @param {number} id - The screenshot ID
   * @returns {Promise<Screenshot|null>} - Screenshot instance or null if not found
   */
  static async getById(id) {
    const screenshotData = await dbManager.getById('screenshots', id);
    return screenshotData ? new Screenshot(screenshotData) : null;
  }

  /**
   * Get all screenshots for a time entry
   * @param {number} timeEntryId - The time entry ID
   * @param {boolean} includeDeleted - Whether to include deleted screenshots
   * @returns {Promise<Array>} - Array of Screenshot instances
   */
  static async getByTimeEntryId(timeEntryId, includeDeleted = false) {
    let query = 'SELECT * FROM screenshots WHERE time_entry_id = ?';
    
    if (!includeDeleted) {
      query += ' AND is_deleted = 0';
    }
    
    query += ' ORDER BY timestamp ASC';
    
    const screenshots = await dbManager.runQuery(query, [timeEntryId]);
    return screenshots.map(data => new Screenshot(data));
  }

  /**
   * Get all screenshots for a user
   * @param {number} userId - The user ID
   * @param {boolean} includeDeleted - Whether to include deleted screenshots
   * @returns {Promise<Array>} - Array of Screenshot instances
   */
  static async getByUserId(userId, includeDeleted = false) {
    let query = `
      SELECT s.* 
      FROM screenshots s
      JOIN time_entries t ON s.time_entry_id = t.id
      WHERE t.user_id = ?
    `;
    
    if (!includeDeleted) {
      query += ' AND s.is_deleted = 0';
    }
    
    query += ' ORDER BY s.timestamp DESC';
    
    const screenshots = await dbManager.runQuery(query, [userId]);
    return screenshots.map(data => new Screenshot(data));
  }

  /**
   * Delete a screenshot permanently
   * @returns {Promise<boolean>} - True if successful
   */
  async delete() {
    if (!this.id) return false;

    return await dbManager.withTransaction(async () => {
      // Try to delete the actual file
      if (this.filepath && fs.existsSync(this.filepath)) {
        try {
          fs.unlinkSync(this.filepath);
        } catch (error) {
          console.error('Failed to delete screenshot file:', error);
          // Continue with database deletion even if file deletion fails
        }
      }

      // Delete any sync queue entries first
      const syncQuery = `
        DELETE FROM sync_status 
        WHERE entity_type = 'screenshot' AND entity_id = ?
      `;
      await dbManager.runQuery(syncQuery, [this.id]);

      // Delete from database
      return await dbManager.delete('screenshots', this.id);
    });
  }
}

module.exports = Screenshot;