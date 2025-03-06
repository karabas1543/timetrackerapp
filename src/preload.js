const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'api', {
    send: (channel, data) => {
      // whitelist channels
      let validChannels = [
        'login', 
        'timer:start', 
        'timer:stop', 
        'timer:pause',
        'timer:resume',
        'timer:addNotes',
        'timer:status',
        'timer:discardIdle',
        'screenshot:delete',
        'settings:save',
        'settings:get',
        'client:getAll',
        'project:getByClient',
        'activity:update'  // New channel for activity updates
        'admin:refreshData',
        'admin:exportReport'      
      ];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, data);
      }
    },
    receive: (channel, func) => {
      let validChannels = [
        'timer:update', 
        'timer:error',
        'screenshot:taken', 
        'idle:detected',
        'client:data',
        'project:data',
        'settings:data',
        'activity:statusChange'  // New channel for activity status changes
        'admin:dataUpdated',
        'admin:error'
      ];
      if (validChannels.includes(channel)) {
        // Deliberately strip event as it includes `sender` 
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      }
    },
    invoke: async (channel, data) => {
      // whitelist channels for synchronous requests
      let validChannels = [
        'client:getAllSync',
        'project:getByClientSync',
        'settings:getSync',
        'activity:getStatus',  // New channel for getting activity status
        'client:getAll',      // Add these for client/project data
        'project:getByClient'
        'admin:getUsers',
        'admin:getTimeEntries',
        'admin:getScreenshots',
        'admin:getScreenshotData',
        'admin:deleteTimeEntry',
        'admin:generateReport'
      ];
      if (validChannels.includes(channel)) {
        return await ipcRenderer.invoke(channel, data);
      }
      return null;
    }
  }
);