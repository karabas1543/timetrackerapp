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
    this.initialized = false;
    
    // Precise timing tracking
    this.timerStartTimes = new Map(); // userId -> timestamp in ms when timer started
    this.timerPauseTimes = new Map(); // userId -> timestamp in ms when timer was paused
    this.timerElapsed = new Map(); // userId -> cumulative elapsed time in ms before latest start/resume
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
          const now = Date.now();
          this.timerStartTimes.set(timeEntry.user_id, now);
          this.timerElapsed.set(timeEntry.user_id, 0); // Reset elapsed time for a new timer
          
          console.log(`Timer started for ${username} at ${new Date(now).toISOString()}`);
          
          event.sender.send('timer:update', { 
            action: 'started',
            timeEntryId: timeEntry.id,
            startTime: timeEntry.start_time,
            userId: timeEntry.user_id,
            serverTime: now // Send server time for potential clock sync
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
          
          // Store the pause time for accurate timing
          const now = Date.now();
          this.timerPauseTimes.set(result.userId, now);
          
          // Calculate elapsed time up to pause point
          if (this.timerStartTimes.has(result.userId)) {
            const currentElapsed = this.timerElapsed.get(result.userId) || 0;
            const startTime = this.timerStartTimes.get(result.userId);
            const elapsedSinceStart = now - startTime;
            
            // Update cumulative elapsed time
            const totalElapsed = currentElapsed + elapsedSinceStart;
            this.timerElapsed.set(result.userId, totalElapsed);
            
            console.log(`Timer paused for ${username} at ${new Date(now).toISOString()}, total elapsed: ${Math.floor(totalElapsed/1000)}s`);
          }
          
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
          
          // Update timer start time to now
          const now = Date.now();
          this.timerStartTimes.set(timeEntry.user_id, now);
          
          // Keep the accumulated elapsed time, just remove the pause time marker
          this.timerPauseTimes.delete(timeEntry.user_id);
          
          console.log(`Timer resumed for ${username} at ${new Date(now).toISOString()}, accumulated: ${Math.floor((this.timerElapsed.get(timeEntry.user_id) || 0)/1000)}s`);
          
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
          
          // Clean up all timing data
          this.timerStartTimes.delete(result.userId);
          this.timerPauseTimes.delete(result.userId);
          this.timerElapsed.delete(result.userId);
          
          console.log(`Timer stopped for ${username}, final duration: ${result.duration}s`);
          
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

    // Get the current timer time
    ipcMain.on('timer:getCurrentTime', (event, data) => {
      const { username } = data;
      this.getCurrentTime(username)
        .then(timeInfo => {
          // Log time calculations for debugging
          if (timeInfo.elapsed > 0) {
            console.log(`Current time for ${username}: ${timeInfo.elapsed}s, isRunning: ${timeInfo.isRunning}`);
          }
          
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

    // Discard idle time
    ipcMain.on('timer:discardIdle', (event, data) => {
      const { username, idleStartTime } = data;
      this.discardIdleTime(username, idleStartTime)
        .then(result => {
          // Emit event about discarded idle time for other services
          this.emit('timer:idle', result.userId, result.timeEntryId, idleStartTime);
          
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
   * Calculate the current elapsed time for a user's timer
   * @param {string} username - The username
   * @returns {Promise<Object>} - Object with elapsed time in seconds
   */
  async getCurrentTime(username) {
    try {
      const user = await User.getByUsername(username);
      
      if (!user || !this.activeTimers.has(user.id)) {
        return { elapsed: 0 };
      }

      // Get the time entry
      const timeEntry = this.activeTimers.get(user.id);
      
      // Calculate the elapsed time
      let elapsedMs = 0;
      
      // Get previously accumulated time
      const prevElapsed = this.timerElapsed.get(user.id) || 0;
      
      if (this.timerStartTimes.has(user.id)) {
        if (this.timerPauseTimes.has(user.id)) {
          // Timer is paused, use the pause time
          elapsedMs = prevElapsed; // Just use the stored elapsed time since we're paused
        } else {
          // Timer is running, use current time
          const startTime = this.timerStartTimes.get(user.id);
          elapsedMs = prevElapsed + (Date.now() - startTime);
        }
      }
      
      // Convert to seconds
      const elapsedSeconds = Math.floor(elapsedMs / 1000);
      
      return {
        elapsed: elapsedSeconds,
        timeEntryId: timeEntry.id,
        isRunning: !this.timerPauseTimes.has(user.id),
        serverTime: Date.now() // Send server time for clock sync
      };
    } catch (error) {
      console.error(`Error getting current time for ${username}:`, error);
      return { elapsed: 0 };
    }
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
    
    // Get previously accumulated time
    const prevElapsed = this.timerElapsed.get(user.id) || 0;
    
    if (this.timerStartTimes.has(user.id)) {
      if (this.timerPauseTimes.has(user.id)) {
        // Timer is paused, use the elapsed time directly
        elapsedSeconds = Math.floor(prevElapsed / 1000);
      } else {
        // Timer is running, add current running segment
        const startTime = this.timerStartTimes.get(user.id);
        elapsedSeconds = Math.floor((prevElapsed + (Date.now() - startTime)) / 1000);
      }
      
      // Set the end time in the db model
      timeEntry.end_time = new Date().toISOString();
      timeEntry.duration = elapsedSeconds;
    } else {
      // Fallback to standard stop if we don't have exact timing info
      await timeEntry.stop();
      elapsedSeconds = timeEntry.duration;
    }
    
    // Save the time entry
    await timeEntry.save();
    
    // Remove from active timers
    this.activeTimers.delete(user.id);
    
    console.log(`Stopped timer for user ${username}, final duration: ${elapsedSeconds}s`);
    
    return {
      timeEntryId: timeEntry.id,
      duration: elapsedSeconds,
      userId: user.id
    };
  }

  /**
   * Discard idle time by pausing the timer at the idle start point
   * @param {string} username - The username
   * @param {number} idleStartTime - Timestamp when idle started
   * @returns {Promise<Object>} - Result with timeEntryId
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
    if (this.timerStartTimes.has(user.id)) {
      const prevElapsed = this.timerElapsed.get(user.id) || 0;
      const startTime = this.timerStartTimes.get(user.id);
      const idleStart = new Date(idleStartTime).getTime();
      
      // Calculate time from current start to idle point
      const elapsedSinceStart = idleStart - startTime;
      
      // Store total elapsed time up to idle point
      this.timerElapsed.set(user.id, prevElapsed + elapsedSinceStart);
      
      // Set pause time to the idle start time
      this.timerPauseTimes.set(user.id, idleStart);
      
      console.log(`Discarded idle time for user ${username}, elapsed before idle: ${Math.floor((prevElapsed + elapsedSinceStart) / 1000)}s`);
    }
    
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