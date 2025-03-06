// Admin Service for Time Tracker App
// Path: src/services/admin/adminService.js

const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const User = require('../../data/models/user');
const TimeEntry = require('../../data/models/timeEntry');
const Screenshot = require('../../data/models/screenshot');
const Client = require('../../data/models/client');
const Project = require('../../data/models/project');
const dbManager = require('../../data/db/dbManager');

class AdminService {
  constructor() {
    this.initialized = false;
  }

  /**
   * Initialize the admin service and register IPC handlers
   */
  initialize() {
    if (this.initialized) return;

    // Register IPC handlers for admin operations
    this.registerIpcHandlers();
    
    console.log('Admin service initialized');
    this.initialized = true;
  }

  /**
   * Register IPC handlers for admin-related events
   */
  registerIpcHandlers() {
    // Get all users
    ipcMain.handle('admin:getUsers', async () => {
      try {
        const users = await User.getAll();
        return users.map(user => ({
          id: user.id,
          username: user.username,
          is_admin: user.is_admin
        }));
      } catch (error) {
        console.error('Error getting users:', error);
        return [];
      }
    });

    // Get time entries for admin view (with filtering)
    ipcMain.handle('admin:getTimeEntries', async (event, data) => {
      try {
        const { userId, fromDate, toDate } = data;
        
        // Build the query based on filters
        let query = `
          SELECT t.*, 
                 COUNT(s.id) as screenshot_count
          FROM time_entries t
          LEFT JOIN screenshots s ON t.id = s.time_entry_id AND s.is_deleted = 0
        `;
        
        const params = [];
        const conditions = [];
        
        // Add date range condition
        if (fromDate && toDate) {
          conditions.push('t.start_time >= ? AND (t.end_time <= ? OR t.end_time IS NULL)');
          params.push(
            new Date(fromDate).toISOString(), 
            new Date(toDate + 'T23:59:59').toISOString()
          );
        }
        
        // Add user filter if specified
        if (userId && userId !== 'all') {
          conditions.push('t.user_id = ?');
          params.push(userId);
        }
        
        // Add WHERE clause if we have conditions
        if (conditions.length > 0) {
          query += ' WHERE ' + conditions.join(' AND ');
        }
        
        // Group by time entry and order by date
        query += ' GROUP BY t.id ORDER BY t.start_time DESC';
        
        // Execute the query
        const timeEntries = await dbManager.runQuery(query, params);
        return timeEntries;
      } catch (error) {
        console.error('Error getting time entries for admin:', error);
        return [];
      }
    });

    // Get screenshots for a time entry
    ipcMain.handle('admin:getScreenshots', async (event, data) => {
      try {
        const { timeEntryId } = data;
        const screenshots = await Screenshot.getByTimeEntryId(timeEntryId);
        
        return screenshots.map(screenshot => ({
          id: screenshot.id,
          time_entry_id: screenshot.time_entry_id,
          filepath: screenshot.filepath,
          timestamp: screenshot.timestamp,
          is_deleted: screenshot.is_deleted
        }));
      } catch (error) {
        console.error('Error getting screenshots for admin:', error);
        return [];
      }
    });

    // Get screenshot image data
    ipcMain.handle('admin:getScreenshotData', async (event, data) => {
      try {
        const { screenshotId } = data;
        
        // Get the screenshot record
        const screenshot = await Screenshot.getById(screenshotId);
        
        if (!screenshot || !screenshot.filepath || !fs.existsSync(screenshot.filepath)) {
          return { success: false, error: 'Screenshot file not found' };
        }
        
        // Read the file and convert to base64
        const imageBuffer = fs.readFileSync(screenshot.filepath);
        const base64Data = imageBuffer.toString('base64');
        
        return {
          success: true,
          data: base64Data,
          timestamp: screenshot.timestamp
        };
      } catch (error) {
        console.error('Error getting screenshot data:', error);
        return { success: false, error: error.message };
      }
    });

    // Delete a time entry (admin only)
    ipcMain.handle('admin:deleteTimeEntry', async (event, data) => {
      try {
        const { timeEntryId } = data;
        
        // Get the time entry
        const timeEntry = await TimeEntry.getById(timeEntryId);
        
        if (!timeEntry) {
          return { success: false, error: 'Time entry not found' };
        }
        
        // Delete the time entry (this will also delete related screenshots)
        await timeEntry.delete();
        
        return { success: true };
      } catch (error) {
        console.error('Error deleting time entry:', error);
        return { success: false, error: error.message };
      }
    });

    // Generate reports
    ipcMain.handle('admin:generateReport', async (event, data) => {
      try {
        const { type, userId, fromDate, toDate } = data;
        
        // Call the appropriate report generator based on type
        let reportData;
        switch (type) {
          case 'user':
            reportData = await this.generateUserReport(userId, fromDate, toDate);
            break;
          case 'client':
            reportData = await this.generateClientReport(userId, fromDate, toDate);
            break;
          case 'project':
            reportData = await this.generateProjectReport(userId, fromDate, toDate);
            break;
          default:
            throw new Error('Invalid report type');
        }
        
        return reportData;
      } catch (error) {
        console.error('Error generating report:', error);
        return [];
      }
    });
  }

  /**
   * Generate a report grouping time entries by user
   * @param {string|null} userId - User ID filter (null for all)
   * @param {string} fromDate - Start date in YYYY-MM-DD format
   * @param {string} toDate - End date in YYYY-MM-DD format
   * @returns {Promise<Array>} - Report data
   */
  async generateUserReport(userId, fromDate, toDate) {
    try {
      // Build the base query
      let query = `
        SELECT 
          u.id as user_id,
          u.username,
          COUNT(t.id) as entry_count,
          SUM(t.duration) as total_seconds,
          SUM(CASE WHEN t.is_billable = 1 THEN t.duration ELSE 0 END) as billable_seconds
        FROM 
          users u
        LEFT JOIN 
          time_entries t ON u.id = t.user_id
      `;
      
      // Add filters
      const conditions = [];
      const params = [];
      
      if (fromDate && toDate) {
        conditions.push('t.start_time >= ? AND (t.end_time <= ? OR t.end_time IS NULL)');
        params.push(
          new Date(fromDate).toISOString(), 
          new Date(toDate + 'T23:59:59').toISOString()
        );
      }
      
      if (userId && userId !== 'all') {
        conditions.push('u.id = ?');
        params.push(userId);
      }
      
      // Add WHERE clause if we have conditions
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      
      // Group by user and sort by total time
      query += ' GROUP BY u.id, u.username ORDER BY total_seconds DESC';
      
      // Execute the query
      const results = await dbManager.runQuery(query, params);
      
      // Format results for report
      return results.map(row => ({
        userId: row.user_id,
        username: row.username,
        entryCount: row.entry_count || 0,
        totalHours: (row.total_seconds || 0) / 3600,
        billableHours: (row.billable_seconds || 0) / 3600
      }));
    } catch (error) {
      console.error('Error generating user report:', error);
      throw error;
    }
  }

  /**
   * Generate a report grouping time entries by client
   * @param {string|null} userId - User ID filter (null for all)
   * @param {string} fromDate - Start date in YYYY-MM-DD format
   * @param {string} toDate - End date in YYYY-MM-DD format
   * @returns {Promise<Array>} - Report data
   */
  async generateClientReport(userId, fromDate, toDate) {
    try {
      // Build the base query
      let query = `
        SELECT 
          c.id as client_id,
          c.name as client_name,
          COUNT(t.id) as entry_count,
          SUM(t.duration) as total_seconds,
          SUM(CASE WHEN t.is_billable = 1 THEN t.duration ELSE 0 END) as billable_seconds
        FROM 
          clients c
        LEFT JOIN 
          time_entries t ON c.id = t.client_id
      `;
      
      // Add filters
      const conditions = [];
      const params = [];
      
      if (fromDate && toDate) {
        conditions.push('t.start_time >= ? AND (t.end_time <= ? OR t.end_time IS NULL)');
        params.push(
          new Date(fromDate).toISOString(), 
          new Date(toDate + 'T23:59:59').toISOString()
        );
      }
      
      if (userId && userId !== 'all') {
        conditions.push('t.user_id = ?');
        params.push(userId);
      }
      
      // Add WHERE clause if we have conditions
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      
      // Group by client and sort by total time
      query += ' GROUP BY c.id, c.name ORDER BY total_seconds DESC';
      
      // Execute the query
      const results = await dbManager.runQuery(query, params);
      
      // Format results for report
      return results.map(row => ({
        clientId: row.client_id,
        clientName: row.client_name,
        entryCount: row.entry_count || 0,
        totalHours: (row.total_seconds || 0) / 3600,
        billableHours: (row.billable_seconds || 0) / 3600
      }));
    } catch (error) {
      console.error('Error generating client report:', error);
      throw error;
    }
  }

  /**
   * Generate a report grouping time entries by project
   * @param {string|null} userId - User ID filter (null for all)
   * @param {string} fromDate - Start date in YYYY-MM-DD format
   * @param {string} toDate - End date in YYYY-MM-DD format
   * @returns {Promise<Array>} - Report data
   */
  async generateProjectReport(userId, fromDate, toDate) {
    try {
      // Build the base query
      let query = `
        SELECT 
          p.id as project_id,
          p.name as project_name,
          c.id as client_id,
          c.name as client_name,
          COUNT(t.id) as entry_count,
          SUM(t.duration) as total_seconds,
          SUM(CASE WHEN t.is_billable = 1 THEN t.duration ELSE 0 END) as billable_seconds
        FROM 
          projects p
        JOIN
          clients c ON p.client_id = c.id
        LEFT JOIN 
          time_entries t ON p.id = t.project_id
      `;
      
      // Add filters
      const conditions = [];
      const params = [];
      
      if (fromDate && toDate) {
        conditions.push('t.start_time >= ? AND (t.end_time <= ? OR t.end_time IS NULL)');
        params.push(
          new Date(fromDate).toISOString(), 
          new Date(toDate + 'T23:59:59').toISOString()
        );
      }
      
      if (userId && userId !== 'all') {
        conditions.push('t.user_id = ?');
        params.push(userId);
      }
      
      // Add WHERE clause if we have conditions
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      
      // Group by project and sort by total time
      query += ' GROUP BY p.id, p.name, c.id, c.name ORDER BY total_seconds DESC';
      
      // Execute the query
      const results = await dbManager.runQuery(query, params);
      
      // Format results for report
      return results.map(row => ({
        projectId: row.project_id,
        projectName: row.project_name,
        clientId: row.client_id,
        clientName: row.client_name,
        entryCount: row.entry_count || 0,
        totalHours: (row.total_seconds || 0) / 3600,
        billableHours: (row.billable_seconds || 0) / 3600
      }));
    } catch (error) {
      console.error('Error generating project report:', error);
      throw error;
    }
  }
}

// Export a singleton instance
const adminService = new AdminService();
module.exports = adminService;