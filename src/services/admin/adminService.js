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
const vpsStore = require('../../data/storage/vpsStore');
const { app } = require('electron');

class AdminService {
  constructor() {
    this.initialized = false;
    this.useVpsSource = true; // Flag to control whether to use VPS as data source
    // Path for temporary files
    this.tempPath = path.join(app.getPath('userData'), 'temp');
    
    // Create temp directory if it doesn't exist
    if (!fs.existsSync(this.tempPath)) {
      try {
        fs.mkdirSync(this.tempPath, { recursive: true });
      } catch (error) {
        console.error('Failed to create temp directory:', error);
      }
    }
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
        // Check if we should use VPS as the data source
        if (this.useVpsSource) {
          return await this.getTimeEntriesFromVps(data);
        } else {
          return await this.getTimeEntriesFromLocal(data);
        }
      } catch (error) {
        console.error('Error getting time entries for admin:', error);
        return [];
      }
    });

    // Get screenshots for a time entry
    ipcMain.handle('admin:getScreenshots', async (event, data) => {
      try {
        const { timeEntryId } = data;
        
        // Check if we should use VPS as the data source
        if (this.useVpsSource) {
          return await this.getScreenshotsFromVps(timeEntryId);
        } else {
          return await this.getScreenshotsFromLocal(timeEntryId);
        }
      } catch (error) {
        console.error('Error getting screenshots for admin:', error);
        return [];
      }
    });

    // Get screenshot image data
    ipcMain.handle('admin:getScreenshotData', async (event, data) => {
      try {
        const { screenshotId, isFromVps } = data;
        
        // Check if screenshot is from VPS
        if (isFromVps || this.useVpsSource) {
          return await this.getScreenshotDataFromVps(screenshotId);
        } else {
          return await this.getScreenshotDataFromLocal(screenshotId);
        }
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
    
    // Toggle data source between VPS and local
    ipcMain.handle('admin:toggleDataSource', async (event, data) => {
      try {
        // Toggle data source flag
        this.useVpsSource = data?.useVps ?? !this.useVpsSource;
        console.log(`Data source toggled to: ${this.useVpsSource ? 'VPS Server' : 'Local'}`);
        return { 
          success: true, 
          useVps: this.useVpsSource 
        };
      } catch (error) {
        console.error('Error toggling data source:', error);
        return { success: false, error: error.message };
      }
    });
    
    // Get data source status
    ipcMain.handle('admin:getDataSourceStatus', () => {
      return { 
        useVps: this.useVpsSource,
        initialized: vpsStore.initialized
      };
    });
    
    // Clear screenshot cache
    ipcMain.handle('admin:clearScreenshotCache', async () => {
      try {
        vpsStore.clearScreenshotCache();
        
        // Also clear temporary files
        this.clearTempDirectory();
        
        return { success: true };
      } catch (error) {
        console.error('Error clearing screenshot cache:', error);
        return { success: false, error: error.message };
      }
    });
    
    // Refresh from VPS
    ipcMain.handle('admin:refreshFromVps', async () => {
      try {
        await vpsStore.syncPendingData();
        return { success: true };
      } catch (error) {
        console.error('Error refreshing from VPS:', error);
        return { success: false, error: error.message };
      }
    });
  }
  
  /**
   * Get time entries from VPS server
   * @param {Object} data - Filter criteria
   * @returns {Promise<Array>} - Array of time entries
   */
  async getTimeEntriesFromVps(data) {
    try {
      const { userId, fromDate, toDate, clientId, projectId } = data;
      
      // Fetch time entries from VPS
      const timeEntries = await vpsStore.fetchTimeEntriesFromVps({
        userId,
        fromDate,
        toDate,
        clientId,
        projectId
      });
      
      // Get screenshot counts for each time entry
      for (const entry of timeEntries) {
        // Find screenshots for this time entry
        const screenshots = await vpsStore.findScreenshotsByTimeEntry(entry.id);
        entry.screenshot_count = screenshots.length;
      }
      
      return timeEntries;
    } catch (error) {
      console.error('Error getting time entries from VPS:', error);
      throw error;
    }
  }
  
  /**
   * Get time entries from local database
   * @param {Object} data - Filter criteria
   * @returns {Promise<Array>} - Array of time entries
   */
  async getTimeEntriesFromLocal(data) {
    try {
      const { userId, fromDate, toDate, clientId, projectId } = data;
      
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
      
      // Add client filter if specified
      if (clientId && clientId !== 'all') {
        conditions.push('t.client_id = ?');
        params.push(clientId);
      }
      
      // Add project filter if specified
      if (projectId && projectId !== 'all') {
        conditions.push('t.project_id = ?');
        params.push(projectId);
      }
      
      // Add WHERE clause if we have conditions
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      
      // Group by time entry and order by date
      query += ' GROUP BY t.id ORDER BY t.start_time DESC';
      
      // Execute the query
      return await dbManager.runQuery(query, params);
    } catch (error) {
      console.error('Error getting time entries from local database:', error);
      throw error;
    }
  }
  
  /**
   * Get screenshots from VPS server
   * @param {number} timeEntryId - Time entry ID
   * @returns {Promise<Array>} - Array of screenshots
   */
  async getScreenshotsFromVps(timeEntryId) {
    try {
      // Find screenshot files on VPS
      const screenshots = await vpsStore.findScreenshotsByTimeEntry(timeEntryId);
      
      // Format screenshot data for the client
      return screenshots.map(screenshot => ({
        id: screenshot.id,
        time_entry_id: timeEntryId,
        filepath: null, // No local filepath for VPS screenshots
        timestamp: screenshot.timestamp,
        is_deleted: 0,
        is_from_vps: true, // Flag to indicate source
        name: screenshot.name
      }));
    } catch (error) {
      console.error('Error getting screenshots from VPS:', error);
      throw error;
    }
  }
  
  /**
   * Get screenshots from local database
   * @param {number} timeEntryId - Time entry ID
   * @returns {Promise<Array>} - Array of screenshots
   */
  async getScreenshotsFromLocal(timeEntryId) {
    try {
      const screenshots = await Screenshot.getByTimeEntryId(timeEntryId);
      
      return screenshots.map(screenshot => ({
        id: screenshot.id,
        time_entry_id: screenshot.time_entry_id,
        filepath: screenshot.filepath,
        timestamp: screenshot.timestamp,
        is_deleted: screenshot.is_deleted,
        is_from_vps: false // Flag to indicate source
      }));
    } catch (error) {
      console.error('Error getting screenshots from local:', error);
      throw error;
    }
  }
  
  /**
   * Get screenshot data from VPS server
   * @param {string} screenshotId - Screenshot ID (VPS file ID)
   * @returns {Promise<Object>} - Screenshot data
   */
  async getScreenshotDataFromVps(screenshotId) {
    try {
      console.log(`Starting download of screenshot ${screenshotId} from VPS`);
      
      // Download screenshot from VPS
      const startTime = Date.now();
      const screenshotData = await vpsStore.downloadScreenshot(screenshotId, true);
      const elapsed = Date.now() - startTime;
      console.log(`Download completed in ${elapsed}ms`);
      
      if (!screenshotData) {
        console.error(`No data returned for screenshot ${screenshotId}`);
        return { 
          success: false, 
          error: 'Failed to download screenshot from VPS',
          errorType: 'no_data'
        };
      }
      
      if (screenshotData.error) {
        console.error(`Error downloading screenshot ${screenshotId}: ${screenshotData.error}`);
        return { 
          success: false, 
          error: screenshotData.error,
          errorType: 'download_error'
        };
      }
      
      // If we have base64 data, return it
      if (screenshotData.base64) {
        console.log(`Returning base64 data of length: ${screenshotData.base64.length}`);
        return {
          success: true,
          data: screenshotData.base64,
          thumbnailPath: screenshotData.thumbnailPath
        };
      }
      
      // If no base64 data but we have a thumbnailPath, try to read the thumbnail
      if (!screenshotData.base64 && screenshotData.thumbnailPath) {
        try {
          console.log(`Using thumbnail as fallback for ${screenshotId}`);
          const thumbnailBuffer = fs.readFileSync(screenshotData.thumbnailPath);
          return {
            success: true,
            data: thumbnailBuffer.toString('base64'),
            thumbnailPath: screenshotData.thumbnailPath,
            isFromThumbnail: true
          };
        } catch (thumbnailError) {
          console.error(`Error reading thumbnail for ${screenshotId}:`, thumbnailError);
        }
      }
      
      // If we get here, we couldn't get the data
      return { 
        success: false, 
        error: 'Could not retrieve screenshot data',
        errorType: 'unknown'
      };
    } catch (error) {
      console.error('Error getting screenshot data from VPS:', error);
      return { 
        success: false, 
        error: error.message,
        errorType: 'exception'
      };
    }
  }
  
  /**
   * Get screenshot data from local file
   * @param {number} screenshotId - Screenshot ID
   * @returns {Promise<Object>} - Screenshot data
   */
  async getScreenshotDataFromLocal(screenshotId) {
    try {
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
      console.error('Error getting screenshot data from local:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Clear the temporary directory
   */
  clearTempDirectory() {
    try {
      // Read directory
      const files = fs.readdirSync(this.tempPath);
      
      // Delete each file
      let deletedCount = 0;
      for (const file of files) {
        try {
          fs.unlinkSync(path.join(this.tempPath, file));
          deletedCount++;
        } catch (error) {
          console.error(`Error deleting temp file ${file}:`, error);
        }
      }
      
      console.log(`Cleared ${deletedCount} files from temp directory`);
    } catch (error) {
      console.error('Error clearing temp directory:', error);
    }
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
      // Check if using VPS data source
      if (this.useVpsSource) {
        return await this.generateUserReportFromVps(userId, fromDate, toDate);
      }
      
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
   * Generate user report from VPS data
   * @param {string|null} userId - User ID filter (null for all)
   * @param {string} fromDate - Start date in YYYY-MM-DD format
   * @param {string} toDate - End date in YYYY-MM-DD format
   * @returns {Promise<Array>} - Report data
   */
  async generateUserReportFromVps(userId, fromDate, toDate) {
    try {
      // Fetch all time entries from VPS
      const timeEntries = await vpsStore.fetchTimeEntriesFromVps({
        userId: userId !== 'all' ? userId : null,
        fromDate,
        toDate
      });
      
      // Get all users
      const users = await User.getAll();
      const userMap = new Map(users.map(user => [user.id, user]));
      
      // Group entries by user
      const userEntries = new Map();
      
      for (const entry of timeEntries) {
        const userId = entry.user_id;
        
        if (!userEntries.has(userId)) {
          userEntries.set(userId, {
            userId,
            username: entry.user?.username || 'Unknown User',
            entries: [],
            totalSeconds: 0,
            billableSeconds: 0
          });
        }
        
        const userData = userEntries.get(userId);
        userData.entries.push(entry);
        
        if (entry.duration) {
          userData.totalSeconds += entry.duration;
          if (entry.is_billable) {
            userData.billableSeconds += entry.duration;
          }
        }
      }
      
      // Convert to array for report
      return Array.from(userEntries.values()).map(userData => ({
        userId: userData.userId,
        username: userData.username,
        entryCount: userData.entries.length,
        totalHours: userData.totalSeconds / 3600,
        billableHours: userData.billableSeconds / 3600
      })).sort((a, b) => b.totalHours - a.totalHours);
    } catch (error) {
      console.error('Error generating user report from VPS:', error);
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
      // Check if using VPS data source
      if (this.useVpsSource) {
        return await this.generateClientReportFromVps(userId, fromDate, toDate);
      }
      
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
   * Generate client report from VPS data
   * @param {string|null} userId - User ID filter (null for all)
   * @param {string} fromDate - Start date in YYYY-MM-DD format
   * @param {string} toDate - End date in YYYY-MM-DD format
   * @returns {Promise<Array>} - Report data
   */
  async generateClientReportFromVps(userId, fromDate, toDate) {
    try {
      // Fetch all time entries from VPS
      const timeEntries = await vpsStore.fetchTimeEntriesFromVps({
        userId: userId !== 'all' ? userId : null,
        fromDate,
        toDate
      });
      
      // Get all clients
      const clients = await Client.getAll();
      const clientMap = new Map(clients.map(client => [client.id, client]));
      
      // Group entries by client
      const clientEntries = new Map();
      
      for (const entry of timeEntries) {
        const clientId = entry.client_id;
        const clientName = entry.client?.name || clientMap.get(clientId)?.name || 'Unknown Client';
        
        if (!clientEntries.has(clientId)) {
          clientEntries.set(clientId, {
            clientId,
            clientName,
            entries: [],
            totalSeconds: 0,
            billableSeconds: 0
          });
        }
        
        const clientData = clientEntries.get(clientId);
        clientData.entries.push(entry);
        
        if (entry.duration) {
          clientData.totalSeconds += entry.duration;
          if (entry.is_billable) {
            clientData.billableSeconds += entry.duration;
          }
        }
      }
      
      // Convert to array for report
      return Array.from(clientEntries.values()).map(clientData => ({
        clientId: clientData.clientId,
        clientName: clientData.clientName,
        entryCount: clientData.entries.length,
        totalHours: clientData.totalSeconds / 3600,
        billableHours: clientData.billableSeconds / 3600
      })).sort((a, b) => b.totalHours - a.totalHours);
    } catch (error) {
      console.error('Error generating client report from VPS:', error);
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
      // Check if using VPS data source
      if (this.useVpsSource) {
        return await this.generateProjectReportFromVps(userId, fromDate, toDate);
      }
      
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
  
  /**
   * Generate project report from VPS data
   * @param {string|null} userId - User ID filter (null for all)
   * @param {string} fromDate - Start date in YYYY-MM-DD format
   * @param {string} toDate - End date in YYYY-MM-DD format
   * @returns {Promise<Array>} - Report data
   */
  async generateProjectReportFromVps(userId, fromDate, toDate) {
    try {
      // Fetch all time entries from VPS
      const timeEntries = await vpsStore.fetchTimeEntriesFromVps({
        userId: userId !== 'all' ? userId : null,
        fromDate,
        toDate
      });
      
      // Get all projects and clients
      const projects = await Project.getAll();
      const clients = await Client.getAll();
      
      const projectMap = new Map(projects.map(project => [project.id, project]));
      const clientMap = new Map(clients.map(client => [client.id, client]));
      
      // Group entries by project
      const projectEntries = new Map();
      
      for (const entry of timeEntries) {
        const projectId = entry.project_id;
        const clientId = entry.client_id;
        
        // Get project and client names either from entry or maps
        const projectName = entry.project?.name || 
                           projectMap.get(projectId)?.name || 
                           'Unknown Project';
        const clientName = entry.client?.name || 
                          clientMap.get(clientId)?.name || 
                          'Unknown Client';
        
        const projectKey = `${projectId}-${clientId}`;
        
        if (!projectEntries.has(projectKey)) {
          projectEntries.set(projectKey, {
            projectId,
            projectName,
            clientId,
            clientName,
            entries: [],
            totalSeconds: 0,
            billableSeconds: 0
          });
        }
        
        const projectData = projectEntries.get(projectKey);
        projectData.entries.push(entry);
        
        if (entry.duration) {
          projectData.totalSeconds += entry.duration;
          if (entry.is_billable) {
            projectData.billableSeconds += entry.duration;
          }
        }
      }
      
      // Convert to array for report
      return Array.from(projectEntries.values()).map(projectData => ({
        projectId: projectData.projectId,
        projectName: projectData.projectName,
        clientId: projectData.clientId,
        clientName: projectData.clientName,
        entryCount: projectData.entries.length,
        totalHours: projectData.totalSeconds / 3600,
        billableHours: projectData.billableSeconds / 3600
      })).sort((a, b) => b.totalHours - a.totalHours);
    } catch (error) {
      console.error('Error generating project report from VPS:', error);
      throw error;
    }
  }
}

// Export a singleton instance
const adminService = new AdminService();
module.exports = adminService;