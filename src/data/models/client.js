// Client Model for Time Tracker App
// Path: src/data/models/client.js

const dbManager = require('../db/dbManager');

class Client {
  /**
   * Create a new Client instance
   * @param {Object} data - Client data
   */
  constructor(data = {}) {
    this.id = data.id || null;
    this.name = data.name || '';
    this.created_at = data.created_at || null;
  }

  /**
   * Save the client to the database (create or update)
   * @returns {Promise<Client>} - The client instance
   */
  async save() {
    // Ensure database is initialized
    dbManager.initialize();

    const clientData = {
      name: this.name
    };

    if (this.id) {
      // Update existing client
      await dbManager.update('clients', this.id, clientData);
    } else {
      // Create new client
      this.id = await dbManager.insert('clients', clientData);
    }

    return this;
  }

  /**
   * Get a client by ID
   * @param {number} id - The client ID
   * @returns {Promise<Client|null>} - Client instance or null if not found
   */
  static async getById(id) {
    // Ensure database is initialized
    dbManager.initialize();

    const clientData = await dbManager.getById('clients', id);
    return clientData ? new Client(clientData) : null;
  }

  /**
   * Get a client by name
   * @param {string} name - The client name
   * @returns {Promise<Client|null>} - Client instance or null if not found
   */
  static async getByName(name) {
    // Ensure database is initialized
    dbManager.initialize();

    const query = 'SELECT * FROM clients WHERE name = ?';
    const results = await dbManager.runQuery(query, [name]);
    
    return results.length > 0 ? new Client(results[0]) : null;
  }

  /**
   * Get all clients
   * @returns {Promise<Array>} - Array of Client instances
   */
  static async getAll() {
    // Ensure database is initialized
    dbManager.initialize();

    const clients = await dbManager.getAll('clients');
    return clients.map(clientData => new Client(clientData));
  }

  /**
   * Get all projects for this client
   * @returns {Promise<Array>} - Array of Project instances
   */
  async getProjects() {
    if (!this.id) return [];

    // We'll need to import the Project model here to avoid circular dependencies
    const Project = require('./project');
    return await Project.getByClientId(this.id);
  }

  /**
   * Delete a client
   * @returns {Promise<boolean>} - True if successful
   */
  async delete() {
    if (!this.id) return false;

    // Ensure database is initialized
    dbManager.initialize();

    return await dbManager.delete('clients', this.id);
  }

  /**
   * Create a new project for this client
   * @param {string} name - Project name
   * @returns {Promise<Object>} - The Project instance
   */
  async createProject(name) {
    if (!this.id) {
      throw new Error('Cannot create project for unsaved client');
    }

    // We'll need to import the Project model here to avoid circular dependencies
    const Project = require('./project');
    
    const project = new Project({
      client_id: this.id,
      name: name
    });
    
    return await project.save();
  }
}

module.exports = Client;