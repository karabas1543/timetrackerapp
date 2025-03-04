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
   * @returns {Screenshot} - The screenshot instance
   */
  save() {
    // Ensure database is initialized
    dbManager.initialize();

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

    if (this.id) {
      // Update existing screenshot
      dbManager.update('screenshots', this.id, screenshotData);
    } else {
      // Create new screenshot
      this.id = dbManager.insert('screenshots', screenshotData);
      
      // Add to sync queue
      this.addToSyncQueue();
    }

    return this;
  }

  /**
   * Add this screenshot to the sync queue
   */
  addToSyncQueue() {
    if (!this.id) return;

    dbManager.initialize();
    
    const syncData = {
      entity_type: 'screenshot',
      entity_id: this.id,
      is_synced: 0,
      last_sync_attempt: null
    };
    
    dbManager.insert('sync_status', syncData);
  }

  /**
   * Create a new screenshot for a time entry
   * @param {number} timeEntryId - The time entry ID
   * @param {Buffer} imageData - The screenshot image data
   * @returns {Screenshot} - The new screenshot instance
   */
  static create(timeEntryId, imageData) {
    // Create screenshots directory if it doesn't exist
    const userDataPath = app.getPath('userData');
    const screenshotsDir = path.join(userDataPath, 'screenshots');
    
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
    
    return screenshot.save();
  }

  /**
   * Mark screenshot as deleted (without actually deleting the file)
   * @returns {Screenshot} - The updated screenshot instance
   */
  markAsDeleted() {
    this.is_deleted = 1;
    return this.save();
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
   * @returns {Screenshot|null} - Screenshot instance or null if not found
   */
  static getById(id) {
    // Ensure database is initialized
    dbManager.initialize();

    const screenshotData = dbManager.getById('screenshots', id);
    return screenshotData ? new Screenshot(screenshotData) : null;
  }

  /**
   * Get all screenshots for a time entry
   * @param {number} timeEntryId - The time entry ID
   * @param {boolean} includeDeleted - Whether to include deleted screenshots
   * @returns {Array} - Array of Screenshot instances
   */
  static getByTimeEntryId(timeEntryId, includeDeleted = false) {
    // Ensure database is initialized
    dbManager.initialize();

    let query = 'SELECT * FROM screenshots WHERE time_entry_id = ?';
    
    if (!includeDeleted) {
      query += ' AND is_deleted = 0';
    }
    
    query += ' ORDER BY timestamp ASC';
    
    const screenshots = dbManager.runQuery(query, [timeEntryId]);
    return screenshots.map(data => new Screenshot(data));
  }

  /**
   * Get all screenshots for a user
   * @param {number} userId - The user ID
   * @param {boolean} includeDeleted - Whether to include deleted screenshots
   * @returns {Array} - Array of Screenshot instances
   */
  static getByUserId(userId, includeDeleted = false) {
    // Ensure database is initialized
    dbManager.initialize();

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
    
    const screenshots = dbManager.runQuery(query, [userId]);
    return screenshots.map(data => new Screenshot(data));
  }

  /**
   * Delete a screenshot permanently
   * @returns {boolean} - True if successful
   */
  delete() {
    if (!this.id) return false;

    // Ensure database is initialized
    dbManager.initialize();

    // Try to delete the actual file
    if (this.filepath && fs.existsSync(this.filepath)) {
      try {
        fs.unlinkSync(this.filepath);
      } catch (error) {
        console.error('Failed to delete screenshot file:', error);
      }
    }

    // Delete from database
    return dbManager.delete('screenshots', this.id);
  }
}

module.exports = Screenshot;