const { app, BrowserWindow, Menu, Tray } = require('electron');
const path = require('path');
const fs = require('fs');

// Import services
const timerService = require('./services/timer/timerService');
const idleDetector = require('./services/timer/idleDetector');
const captureService = require('./services/screenshot/captureService');
const activityTracker = require('./services/activity/activityTracker');
const dataService = require('./services/data/dataService');

// Log icon path for debugging
console.log('Icon path:', path.join(__dirname, '..', 'resources', 'icons'));

// Keep a global reference of the window object to prevent it from being garbage collected
let mainWindow;
let tray;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Load the index.html file
  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));

  // Open DevTools during development (you can comment this out later)
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
  // Initialize timer service
  timerService.initialize();
  
  // Initialize idle detector
  idleDetector.initialize();
  
  // Initialize screenshot capture service
  captureService.initialize();
  
  // Initialize activity tracker
  activityTracker.initialize();

  // Initialize data service
  dataService.initialize();
  
  // Listen for timer events to control other services
  setupServiceIntegration();
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
  timerService.on('timer:stopped', (userId) => {
    console.log(`Timer stopped for user ${userId}, stopping screenshot capture and activity tracking`);
    captureService.stopCapturing(userId);
    activityTracker.stopTracking(userId);
  });
  
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
    console.log('Using icon at:', iconPath);
    
    // Check if file exists
    if (fs.existsSync(iconPath)) {
      console.log('Icon file exists at this path');
    } else {
      console.log('Icon file does NOT exist at this path!');
    }
    
    // Try with absolute path as a test
    tray = new Tray(iconPath);
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Show App', click: () => { mainWindow.show(); } },
      { label: 'Quit', click: () => { app.quit(); } }
    ]);
    tray.setToolTip('Time Tracker');
    tray.setContextMenu(contextMenu);
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
app.on('will-quit', () => {
  // Stop the idle detector
  idleDetector.stop();
});