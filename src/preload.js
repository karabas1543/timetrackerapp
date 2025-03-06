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
        'activity:update',
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
        'activity:statusChange',
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
        'activity:getStatus',
        'client:getAll',
        'project:getByClient',
        'admin:getUsers',
        'admin:getTimeEntries',
        'admin:getScreenshots',
        'admin:getScreenshotData',
        'admin:deleteTimeEntry',
        'admin:generateReport',
        // New channels for Drive integration
        'admin:toggleDataSource',
        'admin:getDataSourceStatus',
        'admin:clearScreenshotCache',
        'admin:refreshFromDrive'
      ];
      if (validChannels.includes(channel)) {
        return await ipcRenderer.invoke(channel, data);
      }
      return null;
    }
  }
);