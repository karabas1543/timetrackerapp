// Activity Tracking UI Script
// Path: src/ui/js/activityTracker.js

/**
 * Activity tracker for the UI - monitors user activity and reports to main process
 */
class ActivityTrackerUI {
    constructor() {
      this.userId = null;
      this.isTracking = false;
      this.lastActivityTime = Date.now();
      this.activityEvents = ['mousemove', 'mousedown', 'keydown', 'wheel', 'scroll', 'touchstart'];
      this.activityCheckInterval = 60000; // Check activity every minute
      this.inactivityThreshold = 5 * 60 * 1000; // 5 minutes in milliseconds
      this.checkIntervalId = null;
      
      // Activity status constants
      this.STATUS = {
        ACTIVE: 'active',
        INACTIVE: 'inactive'
      };
      
      // Current status
      this.currentStatus = this.STATUS.INACTIVE;
    }
  
    /**
     * Start tracking user activity
     * @param {number} userId - The user ID to associate with activity
     */
    startTracking(userId) {
      if (this.isTracking) {
        this.stopTracking();
      }
      
      this.userId = userId;
      this.lastActivityTime = Date.now();
      this.currentStatus = this.STATUS.ACTIVE;
      
      // Add event listeners for user activity
      this.activityEvents.forEach(eventType => {
        window.addEventListener(eventType, this.handleUserActivity.bind(this), { passive: true });
      });
      
      // Set up interval to check for inactivity
      this.checkIntervalId = setInterval(() => {
        this.checkActivity();
      }, this.activityCheckInterval);
      
      // Send initial status
      this.updateStatus(this.STATUS.ACTIVE);
      
      console.log(`Started activity tracking for user ${userId}`);
      this.isTracking = true;
    }
  
    /**
     * Stop tracking user activity
     */
    stopTracking() {
      if (!this.isTracking) return;
      
      // Remove event listeners
      this.activityEvents.forEach(eventType => {
        window.removeEventListener(eventType, this.handleUserActivity.bind(this));
      });
      
      // Clear interval
      if (this.checkIntervalId) {
        clearInterval(this.checkIntervalId);
        this.checkIntervalId = null;
      }
      
      console.log(`Stopped activity tracking for user ${this.userId}`);
      this.isTracking = false;
      this.userId = null;
    }
  
    /**
     * Handle user activity events
     */
    handleUserActivity() {
      this.lastActivityTime = Date.now();
      
      // If status was inactive, update to active
      if (this.currentStatus !== this.STATUS.ACTIVE) {
        this.currentStatus = this.STATUS.ACTIVE;
        this.updateStatus(this.STATUS.ACTIVE);
      }
    }
  
    /**
     * Check if user is active or inactive
     */
    checkActivity() {
      if (!this.isTracking) return;
      
      const now = Date.now();
      const timeSinceLastActivity = now - this.lastActivityTime;
      
      // If no activity for more than the threshold, mark as inactive
      if (timeSinceLastActivity > this.inactivityThreshold && this.currentStatus === this.STATUS.ACTIVE) {
        this.currentStatus = this.STATUS.INACTIVE;
        this.updateStatus(this.STATUS.INACTIVE);
        console.log(`User ${this.userId} is now inactive`);
      }
    }
  
    /**
     * Update activity status and send to main process
     * @param {string} status - The activity status
     */
    updateStatus(status) {
      if (!this.userId) return;
      
      // Send status to main process
      window.api.send('activity:update', {
        userId: this.userId,
        status: status,
        timestamp: new Date().toISOString()
      });
    }
  
    /**
     * Get the current activity status
     * @returns {string} - Current status
     */
    getStatus() {
      return this.currentStatus;
    }
  }
  
  // Create and export a singleton instance
  const activityTrackerUI = new ActivityTrackerUI();
  
  // Make it available globally
  window.activityTrackerUI = activityTrackerUI;
  
  // Export for module usage
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = activityTrackerUI;
  }