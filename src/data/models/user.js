// User Model for Time Tracker App
// Path: src/data/models/user.js

const dbManager = require('../db/dbManager');

class User {
  /**
   * Create a new User instance
   * @param {Object} data - User data
   */
  constructor(data = {}) {
    this.id = data.id || null;
    this.username = data.username || '';
    this.is_admin = data.is_admin || 0;
    this.created_at = data.created_at || null;
  }

  /**
   * Save the user to the database (create or update)
   * @returns {Promise<User>} - The user instance
   */
  async save() {
    const userData = {
      username: this.username,
      is_admin: this.is_admin
    };

    await dbManager.withTransaction(async () => {
      if (this.id) {
        // Update existing user
        await dbManager.update('users', this.id, userData);
      } else {
        // Create new user
        this.id = await dbManager.insert('users', userData);
      }
    });

    return this;
  }

  /**
   * Get a user by ID
   * @param {number} id - The user ID
   * @returns {Promise<User|null>} - User instance or null if not found
   */
  static async getById(id) {
    const userData = await dbManager.getById('users', id);
    return userData ? new User(userData) : null;
  }

  /**
   * Get a user by username
   * @param {string} username - The username
   * @returns {Promise<User|null>} - User instance or null if not found
   */
  static async getByUsername(username) {
    const query = 'SELECT * FROM users WHERE username = ?';
    const results = await dbManager.runQuery(query, [username]);
    
    return results.length > 0 ? new User(results[0]) : null;
  }

  /**
   * Get all users
   * @returns {Promise<Array>} - Array of User instances
   */
  static async getAll() {
    const users = await dbManager.getAll('users');
    return users.map(userData => new User(userData));
  }

  /**
   * Create or get a user by username
   * @param {string} username - The username
   * @param {boolean} isAdmin - Whether the user is an admin
   * @returns {Promise<User>} - The User instance
   */
  static async findOrCreate(username, isAdmin = false) {
    return await dbManager.withTransaction(async () => {
      let user = await User.getByUsername(username);
      
      if (!user) {
        user = new User({
          username: username,
          is_admin: isAdmin ? 1 : 0
        });
        await user.save();
      }
      
      return user;
    });
  }

  /**
   * Delete a user
   * @returns {Promise<boolean>} - True if successful
   */
  async delete() {
    if (!this.id) return false;

    return await dbManager.withTransaction(async () => {
      // First get all time entries for this user
      const TimeEntry = require('./timeEntry');
      const timeEntries = await TimeEntry.getByUserId(this.id);
      
      // Delete all time entries for this user
      for (const timeEntry of timeEntries) {
        await timeEntry.delete();
      }
      
      // Then delete the user itself
      return await dbManager.delete('users', this.id);
    });
  }

  /**
   * Get all time entries for this user
   * @returns {Promise<Array>} - Array of TimeEntry instances
   */
  async getTimeEntries() {
    if (!this.id) return [];

    // Import the TimeEntry model to avoid circular dependencies
    const TimeEntry = require('./timeEntry');
    return await TimeEntry.getByUserId(this.id);
  }

  /**
   * Check if user is admin
   * @returns {boolean} - True if user is an admin
   */
  isAdmin() {
    return this.is_admin === 1;
  }
  
  /**
   * Get all screenshots taken by this user
   * @returns {Promise<Array>} - Array of Screenshot instances
   */
  async getScreenshots() {
    if (!this.id) return [];
    
    // Import the Screenshot model to avoid circular dependencies
    const Screenshot = require('./screenshot');
    return await Screenshot.getByUserId(this.id);
  }
  
  /**
   * Set admin status
   * @param {boolean} isAdmin - Whether the user should be an admin
   * @returns {Promise<User>} - The updated user
   */
  async setAdmin(isAdmin) {
    this.is_admin = isAdmin ? 1 : 0;
    return await this.save();
  }
}

module.exports = User;