// Local Storage Manager for Time Tracker App
// Path: src/data/storage/localStore.js

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const dbManager = require('../db/dbManager');

class LocalStore {
  constructor() {
    // 3-month retention period in milliseconds (90 days)
    this.retentionPeriod = 90 * 24 * 60 * 60 * 1000;
    this.userDataPath = app.getPath('userData');
  }

  /**
   * Initialize the local storage
   */
  initialize() {
    // Ensure database is initialized
    dbManager.initialize();
    
    // Create necessary directories
    this.createDirectories();
  }

  /**
   * Create necessary directories for local storage
   */
  createDirectories() {
    const directories = [
      path.join(this.userDataPath, 'screenshots'),
      path.join(this.userDataPath, 'exports')
    ];
    
    directories.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Clean up old data based on retention policy
   * @returns {Object} - Summary of cleaned data
   */
  cleanupOldData() {
    // Calculate the cutoff date (3 months ago)
    const cutoffDate = new Date(Date.now() - this.retentionPeriod).toISOString();
    
    // Clean up old time entries
    const deletedTimeEntries = this.cleanupOldTimeEntries(cutoffDate);
    
    // Clean up old screenshots
    const deletedScreenshots = this.cleanupOldScreenshots(cutoffDate);
    
    return {
      timeEntries: deletedTimeEntries,
      screenshots: deletedScreenshots
    };
  }

  /**
   * Clean up old time entries
   * @param {string} cutoffDate - ISO date string for the cutoff
   * @returns {number} - Number of entries deleted
   */
  cleanupOldTimeEntries(cutoffDate) {
    const query = `
      DELETE FROM time_entries 
      WHERE end_time IS NOT NULL 
      AND end_time < ? 
      AND id NOT IN (
        SELECT entity_id FROM sync_status 
        WHERE entity_type = 'time_entry' 
        AND is_synced = 0
      )
    `;
    
    const result = dbManager.runQuery(query, [cutoffDate]);
    return result.changes || 0;
  }

  /**
   * Clean up old screenshots
   * @param {string} cutoffDate - ISO date string for the cutoff
   * @returns {number} - Number of screenshots deleted
   */
  cleanupOldScreenshots(cutoffDate) {
    // First, get the list of old screenshots
    const query = `
      SELECT s.* FROM screenshots s
      JOIN time_entries t ON s.time_entry_id = t.id
      WHERE s.timestamp < ?
      AND s.id NOT IN (
        SELECT entity_id FROM sync_status 
        WHERE entity_type = 'screenshot' 
        AND is_synced = 0
      )
    `;
    
    const oldScreenshots = dbManager.runQuery(query, [cutoffDate]);
    let deletedCount = 0;
    
    // Delete screenshot files and records
    oldScreenshots.forEach(screenshot => {
      try {
        // Delete file if it exists
        if (screenshot.filepath && fs.existsSync(screenshot.filepath)) {
          fs.unlinkSync(screenshot.filepath);
        }
        
        // Delete database record
        dbManager.delete('screenshots', screenshot.id);
        deletedCount++;
      } catch (error) {
        console.error('Error deleting screenshot:', error);
      }
    });
    
    return deletedCount;
  }

  /**
   * Schedule regular cleanup based on retention policy
   * @param {number} intervalHours - How often to run cleanup (in hours)
   */
  scheduleCleanup(intervalHours = 24) {
    // Convert hours to milliseconds
    const interval = intervalHours * 60 * 60 * 1000;
    
    // Run initial cleanup
    this.cleanupOldData();
    
    // Schedule regular cleanup
    setInterval(() => {
      console.log('Running scheduled data cleanup');
      this.cleanupOldData();
    }, interval);
  }

  /**
   * Get the path for storing a screenshot
   * @param {number} timeEntryId - The time entry ID
   * @returns {string} - The file path
   */
  getScreenshotPath(timeEntryId) {
    const timestamp = new Date().getTime();
    const filename = `te_${timeEntryId}_${timestamp}.png`;
    return path.join(this.userDataPath, 'screenshots', filename);
  }

  /**
   * Get the path for storing an export file
   * @param {string} filename - The export filename
   * @returns {string} - The file path
   */
  getExportPath(filename) {
    return path.join(this.userDataPath, 'exports', filename);
  }
}

// Export a singleton instance
const localStore = new LocalStore();
module.exports = localStore;