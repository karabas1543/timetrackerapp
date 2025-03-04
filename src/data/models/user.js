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
    // Ensure database is initialized
    dbManager.initialize();

    const userData = {
      username: this.username,
      is_admin: this.is_admin
    };

    if (this.id) {
      // Update existing user
      await dbManager.update('users', this.id, userData);
    } else {
      // Create new user
      this.id = await dbManager.insert('users', userData);
    }

    return this;
  }

  /**
   * Get a user by ID
   * @param {number} id - The user ID
   * @returns {Promise<User|null>} - User instance or null if not found
   */
  static async getById(id) {
    // Ensure database is initialized
    dbManager.initialize();

    const userData = await dbManager.getById('users', id);
    return userData ? new User(userData) : null;
  }

  /**
   * Get a user by username
   * @param {string} username - The username
   * @returns {Promise<User|null>} - User instance or null if not found
   */
  static async getByUsername(username) {
    // Ensure database is initialized
    dbManager.initialize();

    const query = 'SELECT * FROM users WHERE username = ?';
    const results = await dbManager.runQuery(query, [username]);
    
    return results.length > 0 ? new User(results[0]) : null;
  }

  /**
   * Get all users
   * @returns {Promise<Array>} - Array of User instances
   */
  static async getAll() {
    // Ensure database is initialized
    dbManager.initialize();

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
    let user = await User.getByUsername(username);
    
    if (!user) {
      user = new User({
        username: username,
        is_admin: isAdmin ? 1 : 0
      });
      await user.save();
    }
    
    return user;
  }

  /**
   * Delete a user
   * @returns {Promise<boolean>} - True if successful
   */
  async delete() {
    if (!this.id) return false;

    // Ensure database is initialized
    dbManager.initialize();

    return await dbManager.delete('users', this.id);
  }
}

module.exports = User;