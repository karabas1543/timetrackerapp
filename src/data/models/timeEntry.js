// TimeEntry Model for Time Tracker App
// Path: src/data/models/timeEntry.js

const dbManager = require('../db/dbManager');

class TimeEntry {
  /**
   * Create a new TimeEntry instance
   * @param {Object} data - TimeEntry data
   */
  constructor(data = {}) {
    this.id = data.id || null;
    this.user_id = data.user_id || null;
    this.client_id = data.client_id || null;
    this.project_id = data.project_id || null;
    this.start_time = data.start_time || null;
    this.end_time = data.end_time || null;
    this.duration = data.duration || null;
    this.notes = data.notes || '';
    this.is_billable = data.is_billable !== undefined ? data.is_billable : 1;
    this.is_edited = data.is_edited || 0;
    this.is_manual = data.is_manual || 0;
    this.created_at = data.created_at || null;
  }

  /**
   * Save the time entry to the database (create or update)
   * @returns {Promise<TimeEntry>} - The time entry instance
   */
  async save() {
    // Validate required fields
    if (!this.user_id || !this.client_id || !this.project_id) {
      throw new Error('TimeEntry requires user_id, client_id, and project_id');
    }

    // If there's an end_time, calculate the duration in seconds
    if (this.start_time && this.end_time) {
      const start = new Date(this.start_time);
      const end = new Date(this.end_time);
      this.duration = Math.floor((end - start) / 1000);
    }

    const timeEntryData = {
      user_id: this.user_id,
      client_id: this.client_id,
      project_id: this.project_id,
      start_time: this.start_time,
      end_time: this.end_time,
      duration: this.duration,
      notes: this.notes,
      is_billable: this.is_billable,
      is_edited: this.is_edited,
      is_manual: this.is_manual
    };

    // Execute save operation and sync queue update in a single transaction
    await dbManager.withTransaction(async () => {
      if (this.id) {
        // Mark as edited when updating an existing entry
        timeEntryData.is_edited = 1;
        await dbManager.update('time_entries', this.id, timeEntryData);
      } else {
        // Create new time entry
        this.id = await dbManager.insert('time_entries', timeEntryData);
        
        // Add to sync queue in the same transaction
        await this.addToSyncQueueInternal();
      }
    });

    return this;
  }

  /**
   * Internal method to add this entry to sync queue (used within transactions)
   * @returns {Promise<void>}
   * @private
   */
  async addToSyncQueueInternal() {
    if (!this.id) return;

    const syncData = {
      entity_type: 'time_entry',
      entity_id: this.id,
      is_synced: 0,
      last_sync_attempt: null
    };
    
    await dbManager.insert('sync_status', syncData);
  }

  /**
   * Add this time entry to the sync queue (public method for external use)
   * @returns {Promise<void>}
   */
  async addToSyncQueue() {
    if (!this.id) return;

    await dbManager.withTransaction(async () => {
      await this.addToSyncQueueInternal();
    });
  }

  /**
   * Start a new time entry
   * @param {number} userId - The user ID
   * @param {number} clientId - The client ID
   * @param {number} projectId - The project ID
   * @param {boolean} isBillable - Whether the time is billable
   * @returns {Promise<TimeEntry>} - The new time entry
   */
  static async start(userId, clientId, projectId, isBillable = true) {
    const timeEntry = new TimeEntry({
      user_id: userId,
      client_id: clientId,
      project_id: projectId,
      start_time: new Date().toISOString(),
      is_billable: isBillable ? 1 : 0
    });
    
    return await timeEntry.save();
  }

  /**
   * Stop an active time entry
   * @returns {Promise<TimeEntry>} - The updated time entry
   */
  async stop() {
    if (!this.id || this.end_time) {
      throw new Error('Cannot stop an entry that is not active');
    }
    
    this.end_time = new Date().toISOString();
    return await this.save();
  }

  /**
   * Add notes to a time entry
   * @param {string} notes - The notes to add
   * @returns {Promise<TimeEntry>} - The updated time entry
   */
  async addNotes(notes) {
    this.notes = notes;
    return await this.save();
  }

  /**
   * Get a time entry by ID
   * @param {number} id - The time entry ID
   * @returns {Promise<TimeEntry|null>} - TimeEntry instance or null if not found
   */
  static async getById(id) {
    const timeEntryData = await dbManager.getById('time_entries', id);
    return timeEntryData ? new TimeEntry(timeEntryData) : null;
  }

  /**
   * Get all time entries for a user
   * @param {number} userId - The user ID
   * @returns {Promise<Array>} - Array of TimeEntry instances
   */
  static async getByUserId(userId) {
    const query = 'SELECT * FROM time_entries WHERE user_id = ?';
    const timeEntries = await dbManager.runQuery(query, [userId]);
    
    return timeEntries.map(data => new TimeEntry(data));
  }

  /**
   * Get all time entries for a project
   * @param {number} projectId - The project ID
   * @returns {Promise<Array>} - Array of TimeEntry instances
   */
  static async getByProjectId(projectId) {
    const query = 'SELECT * FROM time_entries WHERE project_id = ?';
    const timeEntries = await dbManager.runQuery(query, [projectId]);
    
    return timeEntries.map(data => new TimeEntry(data));
  }

  /**
   * Get all time entries for a client
   * @param {number} clientId - The client ID
   * @returns {Promise<Array>} - Array of TimeEntry instances
   */
  static async getByClientId(clientId) {
    const query = 'SELECT * FROM time_entries WHERE client_id = ?';
    const timeEntries = await dbManager.runQuery(query, [clientId]);
    
    return timeEntries.map(data => new TimeEntry(data));
  }

  /**
   * Get time entries for a user in a date range
   * @param {number} userId - The user ID
   * @param {string} startDate - Start date (ISO string)
   * @param {string} endDate - End date (ISO string)
   * @returns {Promise<Array>} - Array of TimeEntry instances
   */
  static async getByDateRange(userId, startDate, endDate) {
    const query = `
      SELECT * FROM time_entries 
      WHERE user_id = ? 
      AND start_time >= ? 
      AND (end_time <= ? OR end_time IS NULL)
    `;
    
    const timeEntries = await dbManager.runQuery(query, [userId, startDate, endDate]);
    return timeEntries.map(data => new TimeEntry(data));
  }

  /**
   * Get active time entry for a user
   * @param {number} userId - The user ID
   * @returns {Promise<TimeEntry|null>} - Active TimeEntry or null
   */
  static async getActive(userId) {
    const query = `
      SELECT * FROM time_entries 
      WHERE user_id = ? 
      AND end_time IS NULL 
      ORDER BY start_time DESC 
      LIMIT 1
    `;
    
    const results = await dbManager.runQuery(query, [userId]);
    return results.length > 0 ? new TimeEntry(results[0]) : null;
  }

  /**
   * Delete a time entry
   * @returns {Promise<boolean>} - True if successful
   */
  async delete() {
    if (!this.id) return false;

    return await dbManager.withTransaction(async () => {
      // First, delete any related records in sync_status
      const syncQuery = `
        DELETE FROM sync_status 
        WHERE entity_type = 'time_entry' AND entity_id = ?
      `;
      await dbManager.runQuery(syncQuery, [this.id]);
      
      // Then delete the time entry itself
      return await dbManager.delete('time_entries', this.id);
    });
  }

  /**
   * Get screenshots for this time entry
   * @returns {Promise<Array>} - Array of Screenshot instances
   */
  async getScreenshots() {
    if (!this.id) return [];

    // Import the Screenshot model to avoid circular dependencies
    const Screenshot = require('./screenshot');
    return await Screenshot.getByTimeEntryId(this.id);
  }

  /**
   * Get activity logs for this time entry
   * @returns {Promise<Array>} - Array of activity log records
   */
  async getActivityLogs() {
    if (!this.id) return [];
    
    const query = 'SELECT * FROM activity_logs WHERE time_entry_id = ? ORDER BY timestamp ASC';
    return await dbManager.runQuery(query, [this.id]);
  }
}

module.exports = TimeEntry;