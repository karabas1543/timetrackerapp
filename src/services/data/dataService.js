// Data Service for Time Tracker App
// Path: src/services/data/dataService.js

const { ipcMain } = require('electron');
const Client = require('../../data/models/client');
const Project = require('../../data/models/project');

class DataService {
  constructor() {
    this.initialized = false;
  }

  /**
   * Initialize the data service
   */
  initialize() {
    if (this.initialized) return;

    // Register IPC handlers
    this.registerIpcHandlers();
    
    console.log('Data service initialized');
    this.initialized = true;
  }

  /**
   * Register IPC handlers for data-related events
   */
  registerIpcHandlers() {
    // Handle get all clients
    ipcMain.handle('client:getAll', async () => {
      try {
        const clients = await Client.getAll();
        return clients.map(client => ({
          id: client.id,
          name: client.name
        }));
      } catch (error) {
        console.error('Error getting clients:', error);
        return [];
      }
    });

    // Handle get projects by client
    ipcMain.handle('project:getByClient', async (event, data) => {
      try {
        const { clientId } = data;
        if (!clientId) return [];
        
        const projects = await Project.getByClientId(clientId);
        return projects.map(project => ({
          id: project.id,
          name: project.name,
          clientId: project.client_id
        }));
      } catch (error) {
        console.error('Error getting projects:', error);
        return [];
      }
    });
  }
}

// Export a singleton instance
const dataService = new DataService();
module.exports = dataService;