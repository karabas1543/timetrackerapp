// Timer Service for Time Tracker App
// Path: src/services/timer/timerService.js

const { app, ipcMain } = require('electron');
const EventEmitter = require('events');
const User = require('../../data/models/user');
const TimeEntry = require('../../data/models/timeEntry');

class TimerService extends EventEmitter {
  constructor() {
    super(); // Initialize the EventEmitter
    this.activeTimers = new Map(); // userId -> timeEntry
    this.timerIntervals = new Map(); // userId -> interval
    this.initialized = false;
    
    // Add these for tracking exact timing
    this.timerStartTimes = new Map(); // userId -> timestamp in ms
    this.timerPauseTimes = new Map(); // userId -> timestamp in ms
    this.timerElapsed = new Map(); // userId -> elapsed time in ms before resuming
  }

  /**
   * Initialize the timer service
   */
  initialize() {
    if (this.initialized) return;

    // Register IPC handlers for timer events
    this.registerIpcHandlers();
    
    console.log('Timer service initialized');
    this.initialized = true;
  }

  /**
   * Register IPC handlers for timer-related events
   */
  registerIpcHandlers() {
    // Start timer
    ipcMain.on('timer:start', (event, data) => {
      const { username, clientId, projectId, isBillable = true } = data;
      this.startTimer(username, clientId, projectId, isBillable)
        .then(timeEntry => {
          // Emit event for other services
          this.emit('timer:started', timeEntry.user_id, timeEntry.id);
          
          // Store the exact start time
          this.timerStartTimes.set(timeEntry.user_id, Date.now());
          this.timerElapsed.set(timeEntry.user_id, 0);
          
          event.sender.send('timer:update', { 
            action: 'started',
            timeEntryId: timeEntry.id,
            startTime: timeEntry.start_time,
            userId: timeEntry.user_id
          });
        })
        .catch(error => {
          console.error('Error starting timer:', error);
          event.sender.send('timer:error', { 
            action: 'start',
            error: error.message
          });
        });
    });

    // Pause timer
    ipcMain.on('timer:pause', (event, data) => {
      const { username } = data;
      this.pauseTimer(username)
        .then(result => {
          // Emit event for other services
          this.emit('timer:paused', result.userId);
          
          // Store the pause time for accurate resuming
          this.timerPauseTimes.set(result.userId, Date.now());
          
          event.sender.send('timer:update', { 
            action: 'paused',
            timeEntryId: result.timeEntryId
          });
        })
        .catch(error => {
          console.error('Error pausing timer:', error);
          event.sender.send('timer:error', { 
            action: 'pause',
            error: error.message
          });
        });
    });

    // Resume timer
    ipcMain.on('timer:resume', (event, data) => {
      const { username } = data;
      this.resumeTimer(username)
        .then(timeEntry => {
          // Emit event for other services
          this.emit('timer:resumed', timeEntry.user_id, timeEntry.id);
          
          // Calculate elapsed time up to this point and update timer start time
          if (this.timerPauseTimes.has(timeEntry.user_id)) {
            const currentElapsed = this.timerElapsed.get(timeEntry.user_id) || 0;
            const pauseTime = this.timerPauseTimes.get(timeEntry.user_id);
            const pauseDuration = Date.now() - pauseTime;
            
            // Store total elapsed time before this resume
            this.timerElapsed.set(timeEntry.user_id, currentElapsed);
            
            // Reset start time to now
            this.timerStartTimes.set(timeEntry.user_id, Date.now());
            
            // Clean up pause time
            this.timerPauseTimes.delete(timeEntry.user_id);
          }
          
          event.sender.send('timer:update', { 
            action: 'resumed',
            timeEntryId: timeEntry.id,
            startTime: timeEntry.start_time
          });
        })
        .catch(error => {
          console.error('Error resuming timer:', error);
          event.sender.send('timer:error', { 
            action: 'resume',
            error: error.message
          });
        });
    });

    // Stop timer
    ipcMain.on('timer:stop', (event, data) => {
      const { username } = data;
      this.stopTimer(username)
        .then(result => {
          // Emit event for other services
          this.emit('timer:stopped', result.userId);
          
          // Clean up timing data
          this.timerStartTimes.delete(result.userId);
          this.timerPauseTimes.delete(result.userId);
          this.timerElapsed.delete(result.userId);
          
          event.sender.send('timer:update', { 
            action: 'stopped',
            timeEntryId: result.timeEntryId,
            duration: result.duration
          });
        })
        .catch(error => {
          console.error('Error stopping timer:', error);
          event.sender.send('timer:error', { 
            action: 'stop',
            error: error.message
          });
        });
    });

    // Add notes to timer
    ipcMain.on('timer:addNotes', (event, data) => {
      const { username, notes } = data;
      this.addNotes(username, notes)
        .then(timeEntry => {
          event.sender.send('timer:update', { 
            action: 'notes',
            timeEntryId: timeEntry.id
          });
        })
        .catch(error => {
          console.error('Error adding notes:', error);
          event.sender.send('timer:error', { 
            action: 'addNotes',
            error: error.message
          });
        });
    });

    // Add this to the registerIpcHandlers method
    ipcMain.on('timer:discardIdle', (event, data) => {
      const { username, idleStartTime } = data;
      this.discardIdleTime(username, idleStartTime)
        .then(result => {
          // Notify the user that idle time was discarded
          event.sender.send('timer:update', { 
            action: 'idleDiscarded',
            timeEntryId: result.timeEntryId,
            startTime: result.startTime
          });
        })
        .catch(error => {
          console.error('Error discarding idle time:', error);
          event.sender.send('timer:error', { 
            action: 'discardIdle',
            error: error.message
          });
        });
    });
    
    // Get current timer
    ipcMain.on('timer:getCurrentTime', (event, data) => {
      const { username } = data;
      this.getCurrentTime(username)
        .then(timeInfo => {
          event.sender.send('timer:currentTime', timeInfo);
        })
        .catch(error => {
          console.error('Error getting current time:', error);
          event.sender.send('timer:error', { 
            action: 'getCurrentTime',
            error: error.message
          });
        });
    });
    
    // Get timer status
    ipcMain.on('timer:status', (event, data) => {
      const { username } = data;
      this.getTimerStatus(username)
        .then(status => {
          event.sender.send('timer:update', { 
            action: 'status',
            ...status
          });
        })
        .catch(error => {
          console.error('Error getting timer status:', error);
          event.sender.send('timer:error', { 
            action: 'status',
            error: error.message
          });
        });
    });
  }

  /**
   * Calculate the current elapsed time for a user
   * @param {string} username - The username
   * @returns {Promise<Object>} - Object with elapsed time in seconds
   */
  async getCurrentTime(username) {
    const user = await User.getByUsername(username);
    
    if (!user || !this.activeTimers.has(user.id)) {
      return { elapsed: 0 };
    }

    // Get the time entry
    const timeEntry = this.activeTimers.get(user.id);
    
    // Calculate the elapsed time
    let elapsedTime = 0;
    
    if (this.timerStartTimes.has(user.id)) {
      const prevElapsed = this.timerElapsed.get(user.id) || 0;
      
      if (this.timerPauseTimes.has(user.id)) {
        // Timer is paused, use the pause time
        const pauseTime = this.timerPauseTimes.get(user.id);
        const startTime = this.timerStartTimes.get(user.id);
        elapsedTime = prevElapsed + (pauseTime - startTime);
      } else {
        // Timer is running, use current time
        const startTime = this.timerStartTimes.get(user.id);
        elapsedTime = prevElapsed + (Date.now() - startTime);
      }
    }
    
    return {
      elapsed: Math.floor(elapsedTime / 1000),
      timeEntryId: timeEntry.id,
      isRunning: !this.timerPauseTimes.has(user.id)
    };
  }

  /**
   * Start a new timer for a user
   * @param {string} username - The username
   * @param {number} clientId - The client ID
   * @param {number} projectId - The project ID
   * @param {boolean} isBillable - Whether the time is billable
   * @returns {Promise<Object>} - The new time entry
   */
  async startTimer(username, clientId, projectId, isBillable = true) {
    // First, check if user already has an active timer
    const user = await User.findOrCreate(username);
    
    // Check if user already has an active timer
    if (this.activeTimers.has(user.id)) {
      throw new Error('User already has an active timer');
    }
    
    // Create a new time entry
    const timeEntry = await TimeEntry.start(user.id, clientId, projectId, isBillable);
    
    // Store the active timer
    this.activeTimers.set(user.id, timeEntry);
    
    console.log(`Started timer for user ${username} on project ${projectId}`);
    return timeEntry;
  }

  /**
   * Pause an active timer
   * @param {string} username - The username
   * @returns {Promise<Object>} - Result with timeEntryId
   */
  async pauseTimer(username) {
    const user = await User.getByUsername(username);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Check if user has an active timer
    if (!this.activeTimers.has(user.id)) {
      throw new Error('No active timer to pause');
    }
    
    // Get the active timer
    const timeEntry = this.activeTimers.get(user.id);
    
    // Clear any interval if it exists
    if (this.timerIntervals.has(user.id)) {
      clearInterval(this.timerIntervals.get(user.id));
      this.timerIntervals.delete(user.id);
    }
    
    console.log(`Paused timer for user ${username}`);
    
    return {
      timeEntryId: timeEntry.id,
      userId: user.id
    };
  }

  /**
   * Resume a paused timer
   * @param {string} username - The username
   * @returns {Promise<Object>} - The time entry
   */
  async resumeTimer(username) {
    const user = await User.getByUsername(username);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Check if user has a paused timer
    if (!this.activeTimers.has(user.id)) {
      throw new Error('No timer to resume');
    }
    
    // Get the active timer
    const timeEntry = this.activeTimers.get(user.id);
    
    console.log(`Resumed timer for user ${username}`);
    
    return timeEntry;
  }

  /**
   * Stop an active timer
   * @param {string} username - The username
   * @returns {Promise<Object>} - Result with timeEntryId and duration
   */
  async stopTimer(username) {
    const user = await User.getByUsername(username);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Check if user has an active timer
    if (!this.activeTimers.has(user.id)) {
      throw new Error('No active timer to stop');
    }
    
    // Get the active timer
    const timeEntry = this.activeTimers.get(user.id);
    
    // Calculate elapsed time for accuracy
    let elapsedSeconds = 0;
    if (this.timerStartTimes.has(user.id)) {
      const prevElapsed = this.timerElapsed.get(user.id) || 0;
      
      if (this.timerPauseTimes.has(user.id)) {
        // Timer is paused, use the pause time
        const pauseTime = this.timerPauseTimes.get(user.id);
        const startTime = this.timerStartTimes.get(user.id);
        elapsedSeconds = Math.floor((prevElapsed + (pauseTime - startTime)) / 1000);
      } else {
        // Timer is running, use current time
        const startTime = this.timerStartTimes.get(user.id);
        elapsedSeconds = Math.floor((prevElapsed + (Date.now() - startTime)) / 1000);
      }
      
      // Set the end time in the db model
      timeEntry.end_time = new Date().toISOString();
      timeEntry.duration = elapsedSeconds;
    } else {
      // Stop the timer normally if we don't have exact timing
      await timeEntry.stop();
      elapsedSeconds = timeEntry.duration;
    }
    
    // Save the time entry
    await timeEntry.save();
    
    // Clear any interval if it exists
    if (this.timerIntervals.has(user.id)) {
      clearInterval(this.timerIntervals.get(user.id));
      this.timerIntervals.delete(user.id);
    }
    
    // Remove from active timers
    this.activeTimers.delete(user.id);
    
    console.log(`Stopped timer for user ${username}, duration: ${elapsedSeconds}s`);
    
    return {
      timeEntryId: timeEntry.id,
      duration: elapsedSeconds,
      userId: user.id
    };
  }

  /**
   * Discard idle time by pausing the timer and creating a new entry
   * @param {string} username - The username
   * @param {number} idleStartTime - Timestamp when idle started
   * @returns {Promise<Object>} - Result with new timeEntryId
   */
  async discardIdleTime(username, idleStartTime) {
    const user = await User.getByUsername(username);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Check if user has an active timer
    if (!this.activeTimers.has(user.id)) {
      throw new Error('No active timer to modify');
    }
    
    // Get the active timer
    const timeEntry = this.activeTimers.get(user.id);
    
    // Calculate elapsed time up to the idle start point
    let elapsedSeconds = 0;
    if (this.timerStartTimes.has(user.id)) {
      const prevElapsed = this.timerElapsed.get(user.id) || 0;
      const startTime = this.timerStartTimes.get(user.id);
      const idleStart = new Date(idleStartTime).getTime();
      
      // Only count time up to the idle start
      elapsedSeconds = Math.floor((prevElapsed + (idleStart - startTime)) / 1000);
      
      // Store the idle start time as our pause time
      this.timerPauseTimes.set(user.id, idleStart);
      
      // Update the time entry
      timeEntry.end_time = new Date(idleStartTime).toISOString();
      timeEntry.duration = elapsedSeconds;
      await timeEntry.save();
    }
    
    // Emit event for stopping timers on services
    this.emit('timer:idle', user.id, timeEntry.id, idleStartTime);
    
    // Return the paused status
    return {
      timeEntryId: timeEntry.id,
      startTime: timeEntry.start_time,
      userId: user.id
    };
  }

  /**
   * Add notes to the current time entry
   * @param {string} username - The username
   * @param {string} notes - The notes to add
   * @returns {Promise<Object>} - The updated time entry
   */
  async addNotes(username, notes) {
    const user = await User.getByUsername(username);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Check if user has an active timer
    if (!this.activeTimers.has(user.id)) {
      throw new Error('No active timer to add notes to');
    }
    
    // Get the active timer
    const timeEntry = this.activeTimers.get(user.id);
    
    // Add notes
    await timeEntry.addNotes(notes);
    
    console.log(`Added notes to timer for user ${username}`);
    
    return timeEntry;
  }

  /**
   * Get the current timer status for a user
   * @param {string} username - The username
   * @returns {Promise<Object>} - Status object with active flag and timer info
   */
  async getTimerStatus(username) {
    const user = await User.getByUsername(username);
    
    if (!user) {
      // Create the user if they don't exist
      const newUser = await User.findOrCreate(username);
      return {
        isActive: false,
        userId: newUser.id
      };
    }
    
    // Check if user has an active timer
    if (!this.activeTimers.has(user.id)) {
      // Check database for unfinished entries (in case of app crash/restart)
      const activeEntry = await TimeEntry.getActive(user.id);
      
      if (activeEntry) {
        // Restore the active timer
        this.activeTimers.set(user.id, activeEntry);
        
        // Set up timing data for restored timer
        const startTime = new Date(activeEntry.start_time).getTime();
        this.timerStartTimes.set(user.id, Date.now());
        this.timerElapsed.set(user.id, Date.now() - startTime);
        
        // Emit event for other services to know this timer is active
        this.emit('timer:restored', user.id, activeEntry.id);
        
        return {
          isActive: true,
          timeEntryId: activeEntry.id,
          startTime: activeEntry.start_time,
          clientId: activeEntry.client_id,
          projectId: activeEntry.project_id,
          userId: user.id
        };
      }
      
      return {
        isActive: false,
        userId: user.id
      };
    }
    
    // Get the active timer
    const timeEntry = this.activeTimers.get(user.id);
    
    return {
      isActive: true,
      timeEntryId: timeEntry.id,
      startTime: timeEntry.start_time,
      clientId: timeEntry.client_id,
      projectId: timeEntry.project_id,
      userId: user.id
    };
  }

  /**
   * Get timer status by user ID and time entry ID
   * @param {number} userId - The user ID
   * @param {number} timeEntryId - The time entry ID
   * @returns {Promise<Object|null>} - Status object or null
   */
  async getTimerStatusById(userId, timeEntryId) {
    // Check if this is the active timer for this user
    const activeEntry = this.activeTimers.get(userId);
    
    if (activeEntry && activeEntry.id === timeEntryId) {
      return {
        isActive: true,
        timeEntryId: activeEntry.id,
        startTime: activeEntry.start_time,
        clientId: activeEntry.client_id,
        projectId: activeEntry.project_id,
        userId: userId
      };
    }
    
    // Check the database for the time entry
    const timeEntry = await TimeEntry.getById(timeEntryId);
    
    // If the entry exists and isn't completed, it's technically active
    if (timeEntry && !timeEntry.end_time) {
      return {
        isActive: true,
        timeEntryId: timeEntry.id,
        startTime: timeEntry.start_time,
        clientId: timeEntry.client_id,
        projectId: timeEntry.project_id,
        userId: timeEntry.user_id
      };
    }
    
    return null;
  }

  /**
   * Get all active users
   * @returns {Array} - Array of user IDs with active timers
   */
  getActiveUsers() {
    return Array.from(this.activeTimers.keys());
  }
}

// Export a singleton instance
const timerService = new TimerService();
module.exports = timerService;