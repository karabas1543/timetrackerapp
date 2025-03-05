// Google Drive Cleanup for Time Tracker App
// Path: src/data/storage/drive/driveCleanup.js

class DriveCleanup {
    /**
     * Create a new DriveCleanup instance
     * @param {DriveManager} driveManager - The Drive Manager instance
     * @param {number} retentionDays - Number of days to retain data (default: 365)
     */
    constructor(driveManager, retentionDays = 365) {
      this.driveManager = driveManager;
      // Convert days to milliseconds
      this.retentionPeriod = retentionDays * 24 * 60 * 60 * 1000;
    }
  
    /**
     * Clean up old data from Google Drive based on retention policy
     * @returns {Promise<Object>} - Results of cleanup
     */
    async cleanupOldData() {
      try {
        // Calculate cutoff date based on retention period
        const cutoffDate = new Date(Date.now() - this.retentionPeriod);
        
        // Format as RFC 3339 timestamp
        const cutoffDateString = cutoffDate.toISOString();
        
        console.log(`Cleaning up files created before ${cutoffDateString}`);
        
        // Delete old time entries
        const timeEntryResults = await this.cleanupFolder(
          this.driveManager.timeEntriesFolderId, 
          cutoffDateString
        );
        
        // Delete old screenshots
        const screenshotResults = await this.cleanupFolder(
          this.driveManager.screenshotsFolderId, 
          cutoffDateString
        );
        
        const totalDeleted = timeEntryResults.deleted + screenshotResults.deleted;
        
        console.log(`Cleanup completed successfully, deleted ${totalDeleted} files`);
        
        return {
          timeEntries: timeEntryResults,
          screenshots: screenshotResults,
          totalDeleted: totalDeleted
        };
      } catch (error) {
        console.error('Error during cleanup:', error);
        return {
          timeEntries: { found: 0, deleted: 0, failed: 0 },
          screenshots: { found: 0, deleted: 0, failed: 0 },
          totalDeleted: 0,
          error: error.message
        };
      }
    }
  
    /**
     * Clean up old files in a specific folder
     * @param {string} folderId - The folder ID to clean up
     * @param {string} cutoffDateString - ISO date string for cutoff
     * @returns {Promise<Object>} - Cleanup results
     */
    async cleanupFolder(folderId, cutoffDateString) {
      try {
        // Find files older than the cutoff date
        const query = `createdTime < '${cutoffDateString}'`;
        
        const files = await this.driveManager.listFiles(folderId, query);
        
        console.log(`Found ${files.length} files to delete in folder ${folderId}`);
        
        let deletedCount = 0;
        let failedCount = 0;
        
        // Delete each old file
        for (const file of files) {
          try {
            const success = await this.driveManager.deleteFile(file.id);
            if (success) {
              console.log(`Deleted old file: ${file.name} (created: ${file.createdTime})`);
              deletedCount++;
            } else {
              console.error(`Failed to delete file ${file.name}`);
              failedCount++;
            }
          } catch (error) {
            console.error(`Error deleting file ${file.name}:`, error);
            failedCount++;
          }
        }
        
        return {
          found: files.length,
          deleted: deletedCount,
          failed: failedCount
        };
      } catch (error) {
        console.error(`Error cleaning up folder ${folderId}:`, error);
        return {
          found: 0,
          deleted: 0,
          failed: 0
        };
      }
    }
  }
  
  module.exports = DriveCleanup;