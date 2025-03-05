// Screenshot Capture Service for Time Tracker App
// Path: src/services/screenshot/captureService.js

const { desktopCapturer, ipcMain, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const Screenshot = require('../../data/models/screenshot');
const timerService = require('../timer/timerService');

class CaptureService {
  constructor() {
    this.captureIntervals = new Map(); // userId -> intervalId
    this.windows = new Set(); // Keep track of windows to notify
    this.initialized = false;
    
    // Configuration
    this.minInterval = 5 * 60 * 1000; // 5 minutes minimum between captures
    this.maxInterval = 15 * 60 * 1000; // 15 minutes maximum between captures
    this.averageInterval = 10 * 60 * 1000; // 10 minutes average
  }

  /**
   * Initialize the capture service
   */
  initialize() {
    if (this.initialized) return;

    // Register IPC handlers
    this.registerIpcHandlers();
    
    console.log('Screenshot capture service initialized');
    this.initialized = true;
  }

  /**
   * Register a window to receive screenshot notifications
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
   * Register IPC handlers for screenshot-related events
   */
  registerIpcHandlers() {
    // Handle screenshot deletion
    ipcMain.on('screenshot:delete', (event, data) => {
      const { screenshotId } = data;
      
      if (!screenshotId) {
        event.sender.send('screenshot:error', { 
          error: 'Invalid screenshot ID' 
        });
        return;
      }
      
      this.deleteScreenshot(screenshotId)
        .then(success => {
          event.sender.send('screenshot:deleted', { 
            id: screenshotId,
            success 
          });
        })
        .catch(error => {
          console.error('Error deleting screenshot:', error);
          event.sender.send('screenshot:error', { 
            error: error.message 
          });
        });
    });
  }

  /**
   * Start capturing screenshots for a user with a time entry
   * @param {number} userId - The user ID
   * @param {number} timeEntryId - The time entry ID
   */
  startCapturing(userId, timeEntryId) {
    // Stop any existing capture schedule for this user
    this.stopCapturing(userId);
    
    // Schedule the first capture with a random delay
    const firstDelay = this.getRandomInterval();
    console.log(`Scheduling first screenshot for user ${userId} in ${Math.round(firstDelay/1000)} seconds`);
    
    const timeoutId = setTimeout(() => {
      // Take the first screenshot
      this.captureScreenshot(userId, timeEntryId);
      
      // Set up recurring captures with random intervals
      this.scheduleRegularCaptures(userId, timeEntryId);
    }, firstDelay);
    
    // Store the timeout ID
    this.captureIntervals.set(userId, { type: 'timeout', id: timeoutId });
  }

  /**
   * Schedule regular screenshot captures with varying intervals
   * @param {number} userId - The user ID
   * @param {number} timeEntryId - The time entry ID
   */
  scheduleRegularCaptures(userId, timeEntryId) {
    // Calculate a random interval for the next capture
    const interval = this.getRandomInterval();
    console.log(`Scheduling next screenshot for user ${userId} in ${Math.round(interval/1000)} seconds`);
    
    // Set up the interval
    const intervalId = setInterval(() => {
      // Check if the time entry is still active
      timerService.getTimerStatusById(userId, timeEntryId)
        .then(status => {
          if (status && status.isActive) {
            // Take a screenshot
            this.captureScreenshot(userId, timeEntryId);
            
            // Clear the current interval and schedule a new one with a different delay
            clearInterval(intervalId);
            this.scheduleRegularCaptures(userId, timeEntryId);
          } else {
            // Time entry is no longer active, stop capturing
            this.stopCapturing(userId);
          }
        })
        .catch(error => {
          console.error(`Error checking timer status for user ${userId}:`, error);
          // Stop on error to be safe
          this.stopCapturing(userId);
        });
    }, interval);
    
    // Store the interval ID
    this.captureIntervals.set(userId, { type: 'interval', id: intervalId });
  }

  /**
   * Stop capturing screenshots for a user
   * @param {number} userId - The user ID
   */
  stopCapturing(userId) {
    const schedule = this.captureIntervals.get(userId);
    
    if (schedule) {
      if (schedule.type === 'timeout') {
        clearTimeout(schedule.id);
      } else {
        clearInterval(schedule.id);
      }
      
      this.captureIntervals.delete(userId);
      console.log(`Stopped screenshot capturing for user ${userId}`);
    }
  }

  /**
   * Generate a random interval between min and max
   * @returns {number} - Random interval in milliseconds
   */
  getRandomInterval() {
    // Generate a random number between minInterval and maxInterval
    return Math.floor(Math.random() * (this.maxInterval - this.minInterval + 1)) + this.minInterval;
  }

  /**
   * Capture a screenshot for a user's time entry
   * @param {number} userId - The user ID
   * @param {number} timeEntryId - The time entry ID
   * @returns {Promise<boolean>} - Success status
   */
  async captureScreenshot(userId, timeEntryId) {
    try {
      console.log(`Capturing screenshot for user ${userId}, time entry ${timeEntryId}`);
      
      // Get all screen sources
      const sources = await desktopCapturer.getSources({ 
        types: ['screen'],
        thumbnailSize: { width: 1920, height: 1080 }
      });
      
      if (sources.length === 0) {
        console.error('No screen sources found');
        return false;
      }
      
      // Use the first source (primary display)
      const source = sources[0];
      
      // Get the thumbnail as an image buffer
      const thumbnail = source.thumbnail.toPNG();
      
      // Save the screenshot to disk and database
      const screenshot = await Screenshot.create(timeEntryId, thumbnail);
      
      // Notify all windows about the screenshot
      this.notifyScreenshotTaken(userId, screenshot.id);
      
      return true;
    } catch (error) {
      console.error('Error capturing screenshot:', error);
      return false;
    }
  }

  /**
   * Notify all windows that a screenshot was taken
   * @param {number} userId - The user ID
   * @param {number} screenshotId - The screenshot ID
   */
  // Modified notifyScreenshotTaken function in captureService.js
notifyScreenshotTaken(userId, screenshotId) {
  this.windows.forEach(window => {
    if (!window.isDestroyed()) {
      // Only send simple serializable data
      window.webContents.send('screenshot:taken', { 
        userId: userId,
        screenshotId: screenshotId,
        timestamp: new Date().toISOString()
      });
    }
  });
}

  /**
   * Delete a screenshot
   * @param {number} screenshotId - The screenshot ID
   * @returns {Promise<boolean>} - Success status
   */
  async deleteScreenshot(screenshotId) {
    try {
      const screenshot = await Screenshot.getById(screenshotId);
      
      if (!screenshot) {
        return false;
      }
      
      // Mark as deleted (doesn't actually delete the file)
      return screenshot.markAsDeleted();
    } catch (error) {
      console.error('Error deleting screenshot:', error);
      throw error;
    }
  }

  /**
   * Delete screenshots within a time period
   * @param {number} timeEntryId - The time entry ID
   * @param {Date} startTime - The start time
   * @param {Date} endTime - The end time
   * @returns {Promise<number>} - Number of screenshots deleted
   */
  async deleteScreenshotsInPeriod(timeEntryId, startTime, endTime) {
    try {
      // Import the Screenshot model
      const Screenshot = require('../../data/models/screenshot');
      
      // Get screenshots for the time entry
      const screenshots = await Screenshot.getByTimeEntryId(timeEntryId, true);
      
      // Filter screenshots within the time period
      const screenshotsToDelete = screenshots.filter(screenshot => {
        const screenshotTime = new Date(screenshot.timestamp);
        return screenshotTime >= startTime && screenshotTime <= endTime;
      });
      
      // Mark each screenshot as deleted
      for (const screenshot of screenshotsToDelete) {
        await screenshot.markAsDeleted();
      }
      
      console.log(`Deleted ${screenshotsToDelete.length} screenshots from idle period`);
      return screenshotsToDelete.length;
    } catch (error) {
      console.error('Error deleting screenshots from idle period:', error);
      return 0;
    }
  }
}

// Export a singleton instance
const captureService = new CaptureService();
module.exports = captureService;