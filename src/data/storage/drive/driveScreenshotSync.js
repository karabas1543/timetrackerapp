// Google Drive Screenshot Sync for Time Tracker App
// Path: src/data/storage/drive/driveScreenshotSync.js

const fs = require('fs');
const dbManager = require('../../db/dbManager');

class DriveScreenshotSync {
  /**
   * Create a new DriveScreenshotSync instance
   * @param {DriveManager} driveManager - The Drive Manager instance
   */
  constructor(driveManager) {
    this.driveManager = driveManager;
  }

  /**
   * Get pending screenshots for sync
   * @returns {Promise<Array>} - Array of screenshot records
   */
  async getPendingScreenshots() {
    try {
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
   * Sync screenshots to Google Drive
   * @returns {Promise<Object>} - Sync results
   */
  async syncPendingScreenshots() {
    try {
      // Get pending screenshots
      const pendingScreenshots = await this.getPendingScreenshots();
      console.log(`Found ${pendingScreenshots.length} pending screenshots`);
      
      // Sync screenshots
      let syncedCount = 0;
      let failedCount = 0;
      
      for (const screenshot of pendingScreenshots) {
        try {
          await this.syncScreenshot(screenshot);
          syncedCount++;
        } catch (error) {
          console.error(`Error syncing screenshot ${screenshot.id}:`, error);
          failedCount++;
        }
      }
      
      return {
        pending: pendingScreenshots.length,
        synced: syncedCount,
        failed: failedCount
      };
    } catch (error) {
      console.error('Error syncing pending screenshots:', error);
      throw error;
    }
  }

  /**
   * Sync a single screenshot to Google Drive
   * @param {Object} screenshot - The screenshot to sync
   * @returns {Promise<string>} - The file ID in Google Drive
   */
  async syncScreenshot(screenshot) {
    try {
      console.log(`Syncing screenshot ${screenshot.id}...`);
      
      return await this.syncWithErrorHandling('screenshot', screenshot.id, async () => {
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
        const fileId = await this.driveManager.uploadFile(
          fileName,
          'image/png',
          fileData,
          this.driveManager.screenshotsFolderId
        );
        
        console.log(`Screenshot ${screenshot.id} synced successfully as file ${fileName} (ID: ${fileId})`);
        return fileId;
      });
    } catch (error) {
      console.error(`Error syncing screenshot ${screenshot.id}:`, error);
      throw error;
    }
  }

  /**
   * Execute operations with handling for a single entity's sync attempt
   * @param {string} entityType - The entity type ('time_entry' or 'screenshot')
   * @param {number} entityId - The entity ID
   * @param {Function} syncOperation - Async function to execute for syncing 
   * @returns {Promise<any>} - Result of the operation
   */
  async syncWithErrorHandling(entityType, entityId, syncOperation) {
    try {
      // Execute the sync operation
      const result = await syncOperation();
      
      // If successful, mark as synced
      await this.markAsSynced(entityType, entityId);
      
      return result;
    } catch (error) {
      // On error, update sync status with error details
      await this.updateSyncStatus(entityType, entityId, error.message);
      
      // Re-throw to allow for centralized error handling
      throw error;
    }
  }

  /**
   * Mark an entity as synced
   * @param {string} entityType - Entity type ('time_entry' or 'screenshot')
   * @param {number} entityId - Entity ID
   */
  async markAsSynced(entityType, entityId) {
    try {
      await dbManager.withTransaction(async () => {
        const query = `
          UPDATE sync_status 
          SET is_synced = 1, last_sync_attempt = ?, sync_error = NULL
          WHERE entity_type = ? AND entity_id = ?
        `;
        
        await dbManager.runQuery(query, [new Date().toISOString(), entityType, entityId]);
      });
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
      await dbManager.withTransaction(async () => {
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
      });
    } catch (error) {
      console.error(`Error updating sync status for ${entityType} ${entityId}:`, error);
    }
  }
}

module.exports = DriveScreenshotSync;