// Activity Tracking Service for Time Tracker App
// Path: src/services/activity/activityTracker.js

const { ipcMain, BrowserWindow, powerMonitor } = require('electron');
const dbManager = require('../../data/db/dbManager');
const timerService = require('../timer/timerService');

class ActivityTracker {
  constructor() {
    this.trackingIntervals = new Map(); // userId -> intervalId
    this.activityStatus = new Map(); // userId -> status
    this.windows = new Set(); // Windows to notify about status changes
    this.checkInterval = 3 * 60 * 1000; // Check every 3 minutes
    this.initialized = false;
    
    // Activity status constants
    this.STATUS = {
      ACTIVE: 'active',
      INACTIVE: 'inactive',
      IDLE: 'idle'
    };
    
    // Idle threshold for inactivity (5 minutes in seconds)
    this.idleThreshold = 5 * 60;
  }

  /**
   * Initialize the activity tracker
   */
  initialize() {
    if (this.initialized) return;

    // Register IPC handlers
    this.registerIpcHandlers();
    
    console.log('Activity tracker initialized');
    this.initialized = true;
  }

  /**
   * Register a window to receive activity status updates
   * @param {BrowserWindow} window - The browser window to register
   */
  registerWindow(window) {
    this.windows.add(window);
    
    // Clean up when window is closed
    window.on('closed', () => {
      this.windows.delete(window);
    });
  }

  /**
   * Register IPC handlers for activity-related events
   */
  registerIpcHandlers() {
    // Listen for user activity events from the renderer
    ipcMain.on('activity:update', (event, data) => {
      const { userId, status } = data;
      
      if (userId && status) {
        this.updateActivityStatus(userId, status);
      }
    });
    
    // Provide current activity status
    ipcMain.handle('activity:getStatus', (event, data) => {
      const { userId } = data;
      
      if (userId) {
        return this.activityStatus.get(userId) || this.STATUS.INACTIVE;
      }
      
      return this.STATUS.INACTIVE;
    });
  }

  /**
   * Start tracking activity for a user
   * @param {number} userId - The user ID
   * @param {number} timeEntryId - The time entry ID
   */
  startTracking(userId, timeEntryId) {
    // Stop any existing tracking for this user
    this.stopTracking(userId);
    
    // Set initial status based on current idle time
    const idleTime = powerMonitor.getSystemIdleTime();
    const initialStatus = idleTime >= this.idleThreshold ? this.STATUS.IDLE : this.STATUS.ACTIVE;
    
    // Update and log initial status
    this.updateActivityStatus(userId, initialStatus, timeEntryId);
    console.log(`Started activity tracking for user ${userId} with initial status: ${initialStatus}`);
    
    // Set up regular status checks
    const intervalId = setInterval(() => {
      this.checkActivityStatus(userId, timeEntryId);
    }, this.checkInterval);
    
    this.trackingIntervals.set(userId, intervalId);
  }

  /**
   * Stop tracking activity for a user
   * @param {number} userId - The user ID
   */
  stopTracking(userId) {
    const intervalId = this.trackingIntervals.get(userId);
    
    if (intervalId) {
      clearInterval(intervalId);
      this.trackingIntervals.delete(userId);
      this.activityStatus.delete(userId);
      console.log(`Stopped activity tracking for user ${userId}`);
    }
  }

  /**
   * Check current activity status for a user
   * @param {number} userId - The user ID
   * @param {number} timeEntryId - The time entry ID
   */
  async checkActivityStatus(userId, timeEntryId) {
    try {
      // Check if the timer is still active
      const timerStatus = await timerService.getTimerStatusById(userId, timeEntryId);
      
      if (!timerStatus || !timerStatus.isActive) {
        // Timer is no longer active, stop tracking
        this.stopTracking(userId);
        return;
      }
      
      // Get the system idle time
      const idleTime = powerMonitor.getSystemIdleTime();
      
      // Determine current status
      let currentStatus;
      if (idleTime >= this.idleThreshold) {
        currentStatus = this.STATUS.IDLE;
      } else {
        // We assume user is active if not idle
        // In a more advanced implementation, additional checks could be performed
        currentStatus = this.STATUS.ACTIVE;
      }
      
      // If status changed, update it
      const previousStatus = this.activityStatus.get(userId);
      if (previousStatus !== currentStatus) {
        this.updateActivityStatus(userId, currentStatus, timeEntryId);
      }
    } catch (error) {
      console.error(`Error checking activity status for user ${userId}:`, error);
    }
  }

  /**
   * Update activity status for a user
   * @param {number} userId - The user ID
   * @param {string} status - The new status (active, inactive, idle)
   * @param {number} timeEntryId - The time entry ID (optional)
   */
  async updateActivityStatus(userId, status, timeEntryId) {
    // Store the status
    this.activityStatus.set(userId, status);
    
    // If we have a time entry ID, log this status in the database
    if (timeEntryId) {
      try {
        // Log to database
        this.logActivity(timeEntryId, status);
        
        // Notify windows about status change
        this.notifyStatusChange(userId, status);
      } catch (error) {
        console.error(`Error updating activity status for user ${userId}:`, error);
      }
    }
  }

  /**
   * Log activity to the database
   * @param {number} timeEntryId - The time entry ID
   * @param {string} status - The activity status
   */
  async logActivity(timeEntryId, status) {
    try {
      dbManager.initialize();
      
      const logData = {
        time_entry_id: timeEntryId,
        status: status,
        timestamp: new Date().toISOString()
      };
      
      dbManager.insert('activity_logs', logData);
      console.log(`Logged activity status "${status}" for time entry ${timeEntryId}`);
    } catch (error) {
      console.error('Error logging activity:', error);
    }
  }

  /**
   * Notify all windows about a status change
   * @param {number} userId - The user ID
   * @param {string} status - The new status
   */
  notifyStatusChange(userId, status) {
    this.windows.forEach(window => {
      if (!window.isDestroyed()) {
        window.webContents.send('activity:statusChange', { 
          userId, 
          status 
        });
      }
    });
  }

  /**
 * Reset activity status for a user
 * @param {number} userId - The user ID
 * @param {number} timeEntryId - The time entry ID
 */
resetActivityStatus(userId, timeEntryId) {
  const idleTime = powerMonitor.getSystemIdleTime();
  const status = idleTime >= this.idleThreshold ? this.STATUS.IDLE : this.STATUS.ACTIVE;
  
  this.updateActivityStatus(userId, status, timeEntryId);
}

  /**
   * Get all activity logs for a time entry
   * @param {number} timeEntryId - The time entry ID
   * @returns {Array} - Array of activity logs
   */
  async getActivityLogs(timeEntryId) {
    try {
      dbManager.initialize();
      
      const query = 'SELECT * FROM activity_logs WHERE time_entry_id = ? ORDER BY timestamp ASC';
      return dbManager.runQuery(query, [timeEntryId]);
    } catch (error) {
      console.error('Error getting activity logs:', error);
      return [];
    }
  }

  /**
   * Get summarized activity data for a time entry
   * @param {number} timeEntryId - The time entry ID
   * @returns {Object} - Summary of activity
   */
  async getActivitySummary(timeEntryId) {
    try {
      const logs = await this.getActivityLogs(timeEntryId);
      
      // Initialize counters for each status
      const summary = {
        active: 0,
        inactive: 0,
        idle: 0,
        total: logs.length
      };
      
      // Count occurrences of each status
      logs.forEach(log => {
        if (summary[log.status] !== undefined) {
          summary[log.status]++;
        }
      });
      
      // Calculate percentages
      if (summary.total > 0) {
        summary.activePercent = Math.round((summary.active / summary.total) * 100);
        summary.inactivePercent = Math.round((summary.inactive / summary.total) * 100);
        summary.idlePercent = Math.round((summary.idle / summary.total) * 100);
      }
      
      return summary;
    } catch (error) {
      console.error('Error generating activity summary:', error);
      return {
        active: 0,
        inactive: 0,
        idle: 0,
        total: 0,
        activePercent: 0,
        inactivePercent: 0,
        idlePercent: 0
      };
    }
  }
}

// Export a singleton instance
const activityTracker = new ActivityTracker();
module.exports = activityTracker;