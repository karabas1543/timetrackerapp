// Google Drive Time Entry Sync for Time Tracker App
// Path: src/data/storage/drive/driveTimeEntrySync.js

const dbManager = require('../../db/dbManager');

class DriveTimeEntrySync {
  /**
   * Create a new DriveTimeEntrySync instance
   * @param {DriveManager} driveManager - The Drive Manager instance
   */
  constructor(driveManager) {
    this.driveManager = driveManager;
  }

  /**
   * Get pending time entries for sync
   * @returns {Promise<Array>} - Array of time entry records
   */
  async getPendingTimeEntries() {
    try {
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
   * Sync time entries to Google Drive
   * @returns {Promise<Object>} - Sync results
   */
  async syncPendingTimeEntries() {
    try {
      // Get pending time entries
      const pendingTimeEntries = await this.getPendingTimeEntries();
      console.log(`Found ${pendingTimeEntries.length} pending time entries`);
      
      // Sync time entries
      let syncedCount = 0;
      let failedCount = 0;
      
      for (const entry of pendingTimeEntries) {
        try {
          await this.syncTimeEntry(entry);
          syncedCount++;
        } catch (error) {
          console.error(`Error syncing time entry ${entry.id}:`, error);
          failedCount++;
        }
      }
      
      return {
        pending: pendingTimeEntries.length,
        synced: syncedCount,
        failed: failedCount
      };
    } catch (error) {
      console.error('Error syncing pending time entries:', error);
      throw error;
    }
  }

  /**
   * Sync a single time entry to Google Drive
   * @param {Object} timeEntry - The time entry to sync
   * @returns {Promise<string>} - The file ID in Google Drive
   */
  async syncTimeEntry(timeEntry) {
    try {
      console.log(`Syncing time entry ${timeEntry.id}...`);

      return await this.syncWithErrorHandling('time_entry', timeEntry.id, async () => {
        // Enrich time entry with related data
        const enrichedEntry = await this.enrichTimeEntry(timeEntry);
        
        // Convert time entry to JSON
        const timeEntryJson = JSON.stringify(enrichedEntry, null, 2);
        
        // Create file name based on entry ID and date
        const fileName = `time_entry_${timeEntry.id}_${new Date(timeEntry.start_time).toISOString().split('T')[0]}.json`;
        
        // Upload to Google Drive
        const fileId = await this.driveManager.uploadFile(
          fileName,
          'application/json',
          Buffer.from(timeEntryJson),
          this.driveManager.timeEntriesFolderId
        );
        
        console.log(`Time entry ${timeEntry.id} synced successfully as file ${fileName} (ID: ${fileId})`);
        return fileId;
      });
    } catch (error) {
      console.error(`Error syncing time entry ${timeEntry.id}:`, error);
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
          app_version: require('electron').app.getVersion ? require('electron').app.getVersion() : 'unknown'
        }
      };
    } catch (error) {
      console.error('Error enriching time entry:', error);
      return timeEntry; // Return original if enrichment fails
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

module.exports = DriveTimeEntrySync;