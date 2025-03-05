const { app, BrowserWindow, Menu, Tray } = require('electron');
const path = require('path');
const fs = require('fs');

// Import services
const timerService = require('./services/timer/timerService');
const idleDetector = require('./services/timer/idleDetector');
const captureService = require('./services/screenshot/captureService');
const activityTracker = require('./services/activity/activityTracker');
const dataService = require('./services/data/dataService');
const driveStore = require('./data/storage/driveStore');

// Log startup info for debugging
console.log('=============================================');
console.log('Time Tracker App Starting');
console.log('Time:', new Date().toISOString());
console.log('App path:', app.getAppPath());
console.log('User data path:', app.getPath('userData'));
console.log('Icon path:', path.join(__dirname, '..', 'resources', 'icons'));
console.log('=============================================');

// Keep a global reference of the window object to prevent it from being garbage collected
let mainWindow;
let tray;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    title: 'Time Tracker',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Load the index.html file
  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));

  // Open DevTools during development (you can uncomment this for debugging)
  // mainWindow.webContents.openDevTools();

  // Handle window closing
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  // Register window with services
  idleDetector.registerWindow(mainWindow);
  captureService.registerWindow(mainWindow);
  activityTracker.registerWindow(mainWindow);
}

// Initialize services
function initializeServices() {
  console.log('Initializing services...');
  
  // Initialize timer service
  timerService.initialize();
  console.log('Timer service initialized');
  
  // Initialize idle detector
  idleDetector.initialize();
  console.log('Idle detector initialized');
  
  // Initialize screenshot capture service
  captureService.initialize();
  console.log('Screenshot capture service initialized');
  
  // Initialize activity tracker
  activityTracker.initialize();
  console.log('Activity tracker initialized');
  
  // Initialize data service
  dataService.initialize();
  console.log('Data service initialized');
  
  // Set up integration between services
  setupServiceIntegration();
  console.log('Services integration set up');
  
  // Initialize Google Drive sync 
  console.log('Initializing Google Drive sync...');
  try {
    // Manual initialization of driveStore
    initializeDriveStore();
  } catch (error) {
    console.error('Error initializing Google Drive sync:', error);
  }
  
  console.log('All services initialized successfully');
}

// Initialize Google Drive store separately to handle async/await properly
function initializeDriveStore() {
  // First check if driveStore is properly loaded
  if (!driveStore) {
    console.error('DriveStore module not found or not properly loaded');
    return;
  }
  
  console.log('DriveStore methods available:', Object.keys(driveStore));
  
  // Check if initialize method exists
  if (typeof driveStore.initialize !== 'function') {
    console.error('DriveStore initialize method not found. Using direct implementation.');
    
    // Implement direct initialization if the method is missing
    if (driveStore.drive === null && !driveStore.initialized) {
      console.log('Attempting manual initialization of Drive Store...');
      
      // Set up auto-sync with a 15-minute interval
      setTimeout(() => {
        if (typeof driveStore.syncPendingData === 'function') {
          console.log('Running initial sync...');
          driveStore.syncPendingData()
            .then(result => {
              console.log('Initial sync completed:', result);
            })
            .catch(error => {
              console.error('Error during initial sync:', error);
            });
          
          // Set up periodic sync
          setInterval(() => {
            console.log('Running scheduled sync...');
            driveStore.syncPendingData()
              .then(result => {
                console.log('Auto-sync completed:', result);
              })
              .catch(error => {
                console.error('Auto-sync error:', error);
              });
          }, 15 * 60 * 1000); // 15 minutes
        } else {
          console.error('SyncPendingData method not available');
        }
      }, 5000); // Wait 5 seconds before first sync
    }
  } else {
    // Use the standard initialization
    driveStore.initialize()
      .then(success => {
        if (success) {
          console.log('Google Drive sync initialized successfully');
          
          // Start auto-sync with a 15-minute interval
          if (typeof driveStore.startAutoSync === 'function') {
            driveStore.startAutoSync(15);
            console.log('Auto-sync started with 15-minute interval');
          } else {
            console.warn('StartAutoSync method not available');
          }
        } else {
          console.warn('Google Drive sync initialization failed. Sync functionality will be limited.');
        }
      })
      .catch(error => {
        console.error('Error during Drive Store initialization:', error);
      });
  }
}

// Set up integration between services
function setupServiceIntegration() {
  // Listen for timer start events to begin screenshot capturing and activity tracking
  timerService.on('timer:started', (userId, timeEntryId) => {
    console.log(`Timer started for user ${userId}, starting screenshot capture and activity tracking`);
    captureService.startCapturing(userId, timeEntryId);
    activityTracker.startTracking(userId, timeEntryId);
  });
  
  // Listen for timer stop events to end screenshot capturing and activity tracking
  // and trigger Google Drive sync
  timerService.on('timer:stopped', (userId) => {
    console.log(`Timer stopped for user ${userId}, stopping screenshot capture and activity tracking`);
    captureService.stopCapturing(userId);
    activityTracker.stopTracking(userId);
    
    // Trigger sync to Google Drive when a timer is stopped
    if (driveStore && typeof driveStore.syncPendingData === 'function') {
      driveStore.syncPendingData()
        .then(result => {
          console.log('Google Drive sync completed:', result);
        })
        .catch(error => {
          console.error('Error during Google Drive sync:', error);
        });
    } else {
      console.warn('Drive sync not available for timer stop event');
    }
  });
  
  // Listen for idle time discarded events to delete screenshots
  timerService.on('idle:discarded', async (userId, timeEntryId, idleStartTime, idleEndTime) => {
    console.log(`Idle time discarded for user ${userId}, deleting associated screenshots`);
    
    // Delete screenshots taken during idle period
    await captureService.deleteScreenshotsInPeriod(
      timeEntryId,
      new Date(idleStartTime),
      new Date(idleEndTime)
    );
  });
  
  // Listen for timer pause events to pause screenshot capturing
  timerService.on('timer:paused', (userId) => {
    console.log(`Timer paused for user ${userId}, stopping screenshot capture`);
    captureService.stopCapturing(userId);
    // We continue activity tracking during pauses for analytics
  });
  
  // Listen for timer resume events to resume screenshot capturing
  timerService.on('timer:resumed', (userId, timeEntryId) => {
    console.log(`Timer resumed for user ${userId}, resuming screenshot capture`);
    captureService.startCapturing(userId, timeEntryId);
  });
  
  // Listen for timer restored events (after app restart)
  timerService.on('timer:restored', (userId, timeEntryId) => {
    console.log(`Timer restored for user ${userId}, resuming services`);
    captureService.startCapturing(userId, timeEntryId);
    activityTracker.startTracking(userId, timeEntryId);
  });

  // Listen for idle time discarded events to delete screenshots during idle period
  timerService.on('timer:idle', async (userId, timeEntryId, idleStartTime) => {
    console.log(`Idle time discarded for user ${userId}, deleting associated screenshots`);
    
    // Delete screenshots taken during idle period (from idle start until now)
    await captureService.deleteScreenshotsInPeriod(
      timeEntryId,
      new Date(idleStartTime),
      new Date()
    );
  });
}

// Create window when app is ready
app.whenReady().then(() => {
  // Initialize services
  initializeServices();
  
  // Create main window
  createWindow();
  
  // Create system tray with better error handling
  try {
    const iconPath = path.join(__dirname, '..', 'resources', 'icons', 'icon.png');
    console.log('Using tray icon at:', iconPath);
    
    // Check if file exists
    if (fs.existsSync(iconPath)) {
      console.log('Icon file exists at this path');
    } else {
      console.warn('Icon file does NOT exist at this path! Using default icon.');
      // Could use a packaged icon here as fallback
    }
    
    // Create tray icon and menu
    tray = new Tray(iconPath);
    const contextMenu = Menu.buildFromTemplate([
      { 
        label: 'Time Tracker', 
        enabled: false,
      },
      { type: 'separator' },
      { 
        label: 'Show App', 
        click: () => { 
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          } else {
            createWindow();
          }
        } 
      },
      { 
        label: 'Sync Now', 
        click: () => { 
          if (driveStore && typeof driveStore.syncPendingData === 'function') {
            driveStore.syncPendingData()
              .then(result => {
                console.log('Manual sync completed:', result);
                // Could show notification here
              })
              .catch(error => {
                console.error('Error during manual sync:', error);
                // Could show error notification here
              });
          } else {
            console.warn('Drive sync not available for manual sync');
          }
        } 
      },
      { type: 'separator' },
      { 
        label: 'Quit', 
        click: () => { 
          // Try to trigger a final sync before quitting
          if (driveStore && typeof driveStore.syncPendingData === 'function') {
            driveStore.syncPendingData()
              .finally(() => {
                app.quit();
              });
          } else {
            app.quit();
          }
        } 
      }
    ]);
    
    tray.setToolTip('Time Tracker');
    tray.setContextMenu(contextMenu);
    
    // Create a timer to update the tray tooltip with active timer info
    setInterval(() => {
      // Get all active users
      const activeUsers = timerService.getActiveUsers();
      
      if (activeUsers.length > 0) {
        tray.setToolTip(`Time Tracker - ${activeUsers.length} active timer(s)`);
      } else {
        tray.setToolTip('Time Tracker - No active timers');
      }
    }, 5000);
  } catch (error) {
    console.error('Failed to create tray icon:', error);
  }
  
  app.on('activate', () => {
    // On macOS re-create a window when dock icon is clicked and no windows are open
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Clean up on app quit
app.on('will-quit', (event) => {
  // Stop the idle detector
  idleDetector.stop();
  
  // Stop auto-sync if method exists
  if (driveStore && typeof driveStore.stopAutoSync === 'function') {
    driveStore.stopAutoSync();
  }
  
  // Perform final sync before quitting if method exists
  if (driveStore && typeof driveStore.syncPendingData === 'function') {
    event.preventDefault(); // Prevent app from quitting immediately
    
    // Do a final sync
    console.log('Performing final sync before quitting...');
    driveStore.syncPendingData()
      .then(() => {
        console.log('Final sync completed');
        app.exit(); // Now exit
      })
      .catch(error => {
        console.error('Error during final sync:', error);
        app.exit(); // Exit even if sync fails
      });
  }
});