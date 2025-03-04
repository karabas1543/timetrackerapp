// Idle Detection Service for Time Tracker App
// Path: src/services/timer/idleDetector.js

const { powerMonitor, ipcMain, BrowserWindow } = require('electron');
const timerService = require('./timerService');

class IdleDetector {
  constructor() {
    this.idleThreshold = 5 * 60; // 5 minutes in seconds
    this.checkInterval = 60; // Check every 60 seconds
    this.intervalId = null;
    this.initialized = false;
    
    // For tracking application windows
    this.windows = new Set();
  }

  /**
   * Initialize the idle detector
   */
  initialize() {
    if (this.initialized) return;

    // Setup idle detection through powerMonitor
    this.setupIdleDetection();
    
    // Register IPC handlers
    this.registerIpcHandlers();
    
    console.log('Idle detector initialized with threshold of', this.idleThreshold, 'seconds');
    this.initialized = true;
  }

  /**
   * Setup idle detection using electron's powerMonitor
   */
  setupIdleDetection() {
    // Start periodic checks for idle time
    this.intervalId = setInterval(() => {
      this.checkIdleStatus();
    }, this.checkInterval * 1000);
    
    // Also check on resume from sleep
    powerMonitor.on('resume', () => {
      console.log('System resumed from sleep, checking idle status');
      this.checkIdleStatus();
    });
    
    // Listen for suspend to potentially pause timers
    powerMonitor.on('suspend', () => {
      console.log('System is suspending');
      // Optionally pause active timers when system suspends
    });
  }

  /**
   * Register a window to receive idle notifications
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
   * Check if the system is idle
   */
  checkIdleStatus() {
    try {
      // Get the system idle time in seconds
      const idleTime = powerMonitor.getSystemIdleTime();
      
      // Log for debugging
      console.log(`System idle time: ${idleTime} seconds`);
      
      // If the system has been idle for more than our threshold
      if (idleTime >= this.idleThreshold) {
        this.handleIdleDetected(idleTime);
      }
    } catch (error) {
      console.error('Error checking idle status:', error);
    }
  }

  /**
   * Handle when idle is detected
   * @param {number} idleTime - The idle time in seconds
   */
  handleIdleDetected(idleTime) {
    console.log(`User has been idle for ${idleTime} seconds, notifying windows`);
    
    // Notify all registered windows
    this.windows.forEach(window => {
      if (!window.isDestroyed()) {
        window.webContents.send('idle:detected', { idleTime });
      }
    });
    
    // Optionally auto-pause timers after a longer period
    const extendedIdleThreshold = 15 * 60; // 15 minutes
    if (idleTime >= extendedIdleThreshold) {
      this.autoHandleExtendedIdle();
    }
  }

  /**
   * Automatically handle extended idle periods
   * Optionally auto-pause timers after a very long idle period
   */
  autoHandleExtendedIdle() {
    // Get all active timers from timer service
    const activeUsers = timerService.getActiveUsers();
    
    // For each active user with a timer running
    activeUsers.forEach(userId => {
      // Get the username from the user ID
      // This would typically require access to the User model
      // For demonstration, we'll just use the ID
      const username = `user-${userId}`;
      
      console.log(`Auto-pausing timer for user ${username} due to extended idle`);
      
      // Pause their timer
      timerService.pauseTimer(username)
        .then(() => {
          console.log(`Successfully auto-paused timer for ${username}`);
        })
        .catch(error => {
          console.error(`Error auto-pausing timer for ${username}:`, error);
        });
    });
  }

  /**
   * Register IPC handlers for idle-related events
   */
  registerIpcHandlers() {
    // Allow renderer to manually check idle time
    ipcMain.handle('idle:getTime', () => {
      return powerMonitor.getSystemIdleTime();
    });
    
    // Allow changing the idle threshold
    ipcMain.on('idle:setThreshold', (event, data) => {
      if (data && data.threshold && typeof data.threshold === 'number') {
        this.idleThreshold = data.threshold;
        console.log('Idle threshold updated to', this.idleThreshold, 'seconds');
      }
    });
  }

  /**
   * Stop the idle detector
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    this.windows.clear();
    this.initialized = false;
    console.log('Idle detector stopped');
  }
}

// Export a singleton instance
const idleDetector = new IdleDetector();
module.exports = idleDetector;