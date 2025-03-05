// Project Model for Time Tracker App
// Path: src/data/models/project.js

const dbManager = require('../db/dbManager');

class Project {
  /**
   * Create a new Project instance
   * @param {Object} data - Project data
   */
  constructor(data = {}) {
    this.id = data.id || null;
    this.client_id = data.client_id || null;
    this.name = data.name || '';
    this.created_at = data.created_at || null;
  }

  /**
   * Save the project to the database (create or update)
   * @returns {Promise<Project>} - The project instance
   */
  async save() {
    if (!this.client_id) {
      throw new Error('Project must have a client_id');
    }

    const projectData = {
      client_id: this.client_id,
      name: this.name
    };

    await dbManager.withTransaction(async () => {
      if (this.id) {
        // Update existing project
        await dbManager.update('projects', this.id, projectData);
      } else {
        // Create new project
        this.id = await dbManager.insert('projects', projectData);
      }
    });

    return this;
  }

  /**
   * Get a project by ID
   * @param {number} id - The project ID
   * @returns {Promise<Project|null>} - Project instance or null if not found
   */
  static async getById(id) {
    const projectData = await dbManager.getById('projects', id);
    return projectData ? new Project(projectData) : null;
  }

  /**
   * Get all projects for a specific client
   * @param {number} clientId - The client ID
   * @returns {Promise<Array>} - Array of Project instances
   */
  static async getByClientId(clientId) {
    const query = 'SELECT * FROM projects WHERE client_id = ?';
    const projects = await dbManager.runQuery(query, [clientId]);
    
    return projects.map(projectData => new Project(projectData));
  }

  /**
   * Get all projects
   * @returns {Promise<Array>} - Array of Project instances
   */
  static async getAll() {
    const projects = await dbManager.getAll('projects');
    return projects.map(projectData => new Project(projectData));
  }

  /**
   * Get the client for this project
   * @returns {Promise<Object|null>} - The Client instance or null
   */
  async getClient() {
    if (!this.client_id) return null;

    // We'll need to import the Client model here to avoid circular dependencies
    const Client = require('./client');
    return await Client.getById(this.client_id);
  }

  /**
   * Delete a project
   * @returns {Promise<boolean>} - True if successful
   */
  async delete() {
    if (!this.id) return false;

    return await dbManager.withTransaction(async () => {
      // First get any time entries for this project
      const TimeEntry = require('./timeEntry');
      const timeEntries = await TimeEntry.getByProjectId(this.id);
      
      // Delete all time entries for this project
      for (const timeEntry of timeEntries) {
        await timeEntry.delete();
      }
      
      // Then delete the project itself
      return await dbManager.delete('projects', this.id);
    });
  }

  /**
   * Get all time entries for this project
   * @returns {Promise<Array>} - Array of TimeEntry instances
   */
  async getTimeEntries() {
    if (!this.id) return [];

    // Import the TimeEntry model to avoid circular dependencies
    const TimeEntry = require('./timeEntry');
    return await TimeEntry.getByProjectId(this.id);
  }

  /**
   * Find or create a project by name and client ID
   * @param {number} clientId - The client ID
   * @param {string} name - The project name
   * @returns {Promise<Project>} - The Project instance
   */
  static async findOrCreate(clientId, name) {
    const query = 'SELECT * FROM projects WHERE client_id = ? AND name = ?';
    const results = await dbManager.runQuery(query, [clientId, name]);
    
    if (results.length > 0) {
      return new Project(results[0]);
    } else {
      const project = new Project({
        client_id: clientId,
        name: name
      });
      
      await project.save();
      return project;
    }
  }
}

module.exports = Project;