// VPS Data Cleanup for Time Tracker App
// Path: src/data/storage/vps/vpsCleanup.js

class VpsCleanup {
    /**
     * Create a new VpsCleanup instance
     * @param {VpsManager} vpsManager - The VPS Manager instance
     * @param {number} retentionDays - Number of days to retain data (default: 365)
     */
    constructor(vpsManager, retentionDays = 365) {
      this.vpsManager = vpsManager;
      // Convert days to milliseconds
      this.retentionPeriod = retentionDays * 24 * 60 * 60 * 1000;
    }
  
    /**
     * Clean up old data from VPS server based on retention policy
     * @returns {Promise<Object>} - Results of cleanup
     */
    async cleanupOldData() {
      try {
        // Calculate cutoff date based on retention period
        const cutoffDate = new Date(Date.now() - this.retentionPeriod);
        
        // Format as ISO string
        const cutoffDateString = cutoffDate.toISOString();
        
        console.log(`Cleaning up data created before ${cutoffDateString}`);
        
        // Trigger cleanup on the VPS server
        const result = await this.vpsManager.post('/cleanup', {
          cutoffDate: cutoffDateString
        });
        
        console.log(`Cleanup completed successfully, deleted ${result.totalDeleted} items`);
        
        return {
          timeEntries: {
            deleted: result.timeEntriesDeleted || 0,
            failed: result.timeEntriesFailed || 0
          },
          screenshots: {
            deleted: result.screenshotsDeleted || 0,
            failed: result.screenshotsFailed || 0
          },
          totalDeleted: result.totalDeleted || 0
        };
      } catch (error) {
        console.error('Error during cleanup:', error);
        return {
          timeEntries: { deleted: 0, failed: 0 },
          screenshots: { deleted: 0, failed: 0 },
          totalDeleted: 0,
          error: error.message
        };
      }
    }
  
    /**
     * Clean up specific data by IDs
     * @param {string} entityType - Type of entity to clean ('time_entries' or 'screenshots')
     * @param {Array<number>} ids - Array of entity IDs to delete
     * @returns {Promise<Object>} - Results of cleanup
     */
    async cleanupByIds(entityType, ids) {
      try {
        if (!ids || !ids.length) {
          return { deleted: 0, failed: 0 };
        }
        
        console.log(`Cleaning up ${ids.length} ${entityType}...`);
        
        // Send deletion request to VPS
        const result = await this.vpsManager.post(`/cleanup/${entityType}`, {
          ids: ids
        });
        
        console.log(`Cleanup of ${entityType} completed: ${result.deleted} deleted, ${result.failed} failed`);
        
        return {
          deleted: result.deleted || 0,
          failed: result.failed || 0
        };
      } catch (error) {
        console.error(`Error cleaning up ${entityType}:`, error);
        return { deleted: 0, failed: ids.length };
      }
    }
  
    /**
     * Get current storage usage stats from VPS
     * @returns {Promise<Object>} - Storage statistics
     */
    async getStorageStats() {
      try {
        const stats = await this.vpsManager.get('/storage/stats');
        return {
          timeEntries: stats.timeEntries || 0,
          screenshots: stats.screenshots || 0,
          screenshotSizeBytes: stats.screenshotSizeBytes || 0,
          oldestItemDate: stats.oldestItemDate,
          diskSpaceUsedMB: stats.diskSpaceUsedMB || 0,
          diskSpaceTotalMB: stats.diskSpaceTotalMB || 0
        };
      } catch (error) {
        console.error('Error getting storage stats:', error);
        return {
          timeEntries: 0,
          screenshots: 0,
          screenshotSizeBytes: 0,
          diskSpaceUsedMB: 0,
          diskSpaceTotalMB: 0,
          error: error.message
        };
      }
    }
  
    /**
     * Update retention period
     * @param {number} days - New retention period in days
     * @returns {Promise<boolean>} - Success status
     */
    async updateRetentionPeriod(days) {
      if (days < 1) {
        console.error('Retention period must be at least 1 day');
        return false;
      }
      
      try {
        // Update local retention period
        this.retentionPeriod = days * 24 * 60 * 60 * 1000;
        
        // Update server retention period
        await this.vpsManager.post('/settings/retention', {
          retentionDays: days
        });
        
        console.log(`Retention period updated to ${days} days`);
        return true;
      } catch (error) {
        console.error('Error updating retention period:', error);
        return false;
      }
    }
  }
  
  module.exports = VpsCleanup;