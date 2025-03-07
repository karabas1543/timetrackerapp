// VPS Screenshot Sync for Time Tracker App
// Path: src/data/storage/vps/vpsScreenshotSync.js

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const dbManager = require('../../db/dbManager');

class VpsScreenshotSync {
  /**
   * Create a new VpsScreenshotSync instance
   * @param {VpsManager} vpsManager - The VPS Manager instance
   */
  constructor(vpsManager) {
    this.vpsManager = vpsManager;
    
    // Path for temporary screenshot storage
    this.tempPath = path.join(app.getPath('userData'), 'temp');
    
    // Create temp directory if it doesn't exist
    if (!fs.existsSync(this.tempPath)) {
      try {
        fs.mkdirSync(this.tempPath, { recursive: true });
      } catch (error) {
        console.error('Failed to create temp directory:', error);
      }
    }
    
    // Screenshot cache to avoid repeated downloads
    this.screenshotCache = new Map();
    this.maxCacheSize = 50; // Maximum number of cached screenshots
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
   * Sync screenshots to VPS server
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
   * Sync a single screenshot to VPS server
   * @param {Object} screenshot - The screenshot to sync
   * @returns {Promise<Object>} - The synced screenshot data
   */
  async syncScreenshot(screenshot) {
    try {
      console.log(`Syncing screenshot ${screenshot.id}...`);
      
      return await this.syncWithErrorHandling('screenshot', screenshot.id, async () => {
        // Check if file exists
        if (!fs.existsSync(screenshot.filepath)) {
          throw new Error('Screenshot file not found at path: ' + screenshot.filepath);
        }
        
        // Metadata for the screenshot
        const metadata = {
          timeEntryId: screenshot.time_entry_id,
          timestamp: screenshot.timestamp,
          isDeleted: screenshot.is_deleted,
          id: screenshot.id
        };
        
        // Upload to VPS server
        const result = await this.vpsManager.uploadFile(
          '/screenshots',
          screenshot.filepath,
          metadata
        );
        
        console.log(`Screenshot ${screenshot.id} synced successfully`);
        return result;
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

  /**
   * Find screenshots by time entry ID on the VPS
   * @param {number} timeEntryId - Time entry ID
   * @returns {Promise<Array>} - Array of screenshot metadata
   */
  async findScreenshotsByTimeEntry(timeEntryId) {
    try {
      console.log(`Finding screenshots for time entry ${timeEntryId} on VPS...`);
      
      // Get screenshots from VPS
      const screenshots = await this.vpsManager.get(`/screenshots/by-time-entry/${timeEntryId}`);
      
      console.log(`Found ${screenshots.length} screenshots for time entry ${timeEntryId}`);
      
      // Mark screenshots as coming from VPS
      return screenshots.map(screenshot => ({
        ...screenshot,
        is_from_vps: true
      }));
    } catch (error) {
      console.error(`Error finding screenshots for time entry ${timeEntryId}:`, error);
      return [];
    }
  }

  /**
   * Download a screenshot from the VPS
   * @param {string} screenshotId - Screenshot ID
   * @param {boolean} useThumbnail - Whether to download thumbnail instead of full image
   * @returns {Promise<Object>} - Object with buffer, base64, and paths
   */
  async downloadScreenshot(screenshotId, useThumbnail = false) {
    // Check cache first
    const cacheKey = `${screenshotId}-${useThumbnail ? 'thumb' : 'full'}`;
    if (this.screenshotCache.has(cacheKey)) {
      console.log(`Using cached screenshot for ${screenshotId}`);
      return this.screenshotCache.get(cacheKey);
    }

    try {
      console.log(`Downloading screenshot ${screenshotId} from VPS...`);
      
      // Determine endpoint based on whether we want thumbnail or full image
      const endpoint = useThumbnail
        ? `/screenshots/${screenshotId}/thumbnail`
        : `/screenshots/${screenshotId}`;
      
      // Generate a unique filename for this download
      const filename = useThumbnail
        ? `${screenshotId}_thumb.png`
        : `${screenshotId}.png`;
      
      const savePath = path.join(this.tempPath, filename);
      
      // Download the file
      await this.vpsManager.downloadFile(endpoint, savePath);
      
      // Read file into buffer
      const buffer = fs.readFileSync(savePath);
      
      // Convert to base64
      const base64 = buffer.toString('base64');
      
      // Create result object
      const result = {
        buffer,
        base64,
        path: savePath,
        thumbnailPath: useThumbnail ? savePath : null
      };
      
      // Add to cache
      this.addToScreenshotCache(cacheKey, result);
      
      return result;
    } catch (error) {
      console.error(`Error downloading screenshot ${screenshotId}:`, error);
      return {
        buffer: null,
        base64: null,
        path: null,
        thumbnailPath: null,
        error: error.message
      };
    }
  }

  /**
   * Add a screenshot to the cache
   * @param {string} key - Cache key
   * @param {Object} data - Screenshot data
   */
  addToScreenshotCache(key, data) {
    // Check if cache is full
    if (this.screenshotCache.size >= this.maxCacheSize) {
      // Remove oldest entry (first key in map)
      const oldestKey = this.screenshotCache.keys().next().value;
      this.screenshotCache.delete(oldestKey);
    }
    
    // Add to cache
    this.screenshotCache.set(key, data);
  }

  /**
   * Clear the screenshot cache and temp files
   */
  clearCache() {
    // Clear cache map
    this.screenshotCache.clear();
    
    // Delete files in temp directory
    try {
      const files = fs.readdirSync(this.tempPath);
      for (const file of files) {
        fs.unlinkSync(path.join(this.tempPath, file));
      }
      console.log(`Cleared ${files.length} files from temporary storage`);
    } catch (error) {
      console.error('Error clearing temp files:', error);
    }
  }
}

module.exports = VpsScreenshotSync;