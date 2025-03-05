// Database Manager using sqlite3 for Time Tracker App
// Path: src/data/db/dbManager.sqlite3.js

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { app } = require('electron');

class DatabaseManager {
  constructor() {
    this.db = null;
    this.initialized = false;
  }

  /**
 * Initialize the database connection and create tables if they don't exist
 */
initialize() {
  if (this.initialized) return;

  try {
    // Create database directory if it doesn't exist
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'database');
    
    if (!fs.existsSync(dbPath)) {
      fs.mkdirSync(dbPath, { recursive: true });
    }
    
    // Connect to the SQLite database
    const dbFile = path.join(dbPath, 'timetracker.db');
    this.db = new sqlite3.Database(dbFile);
    
    // Enable foreign keys
    this.db.run('PRAGMA foreign_keys = ON');
    
    // Load and execute schema SQL
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Execute each statement in the schema
    this.db.serialize(() => {
      schema.split(';').forEach(statement => {
        if (statement.trim()) {
          this.db.run(statement);
        }
      });
      
      // Clean up duplicate clients
      const dedupClients = `
        DELETE FROM clients WHERE id NOT IN (
          SELECT MIN(id) FROM clients GROUP BY name
        )
      `;
      this.db.run(dedupClients);
      
      // Clean up duplicate projects
      const dedupProjects = `
        DELETE FROM projects WHERE id NOT IN (
          SELECT MIN(id) FROM projects GROUP BY client_id, name
        )
      `;
      this.db.run(dedupProjects);
      
      console.log('Cleaned up duplicate clients and projects');
    });
    
    console.log('Database initialized successfully');
    this.initialized = true;
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}
  /**
   * Get a single record by ID
   * @param {string} table - The table name
   * @param {number} id - The record ID
   * @returns {Promise<Object|null>} - The record or null if not found
   */
  getById(table, id) {
    return new Promise((resolve, reject) => {
      try {
        const query = `SELECT * FROM ${table} WHERE id = ?`;
        this.db.get(query, [id], (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row || null);
          }
        });
      } catch (error) {
        console.error(`Error getting ${table} record by ID:`, error);
        reject(error);
      }
    });
  }

  /**
   * Get all records from a table
   * @param {string} table - The table name
   * @returns {Promise<Array>} - Array of records
   */
  getAll(table) {
    return new Promise((resolve, reject) => {
      try {
        const query = `SELECT * FROM ${table}`;
        this.db.all(query, [], (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        });
      } catch (error) {
        console.error(`Error getting all ${table} records:`, error);
        reject(error);
      }
    });
  }

  /**
   * Insert a record into a table
   * @param {string} table - The table name
   * @param {Object} data - The data to insert
   * @returns {Promise<number>} - The ID of the inserted record
   */
  insert(table, data) {
    return new Promise((resolve, reject) => {
      try {
        const columns = Object.keys(data).join(', ');
        const placeholders = Object.keys(data).map(() => '?').join(', ');
        const values = Object.values(data);
        
        const query = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`;
        this.db.run(query, values, function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.lastID);
          }
        });
      } catch (error) {
        console.error(`Error inserting into ${table}:`, error);
        reject(error);
      }
    });
  }

  /**
   * Update a record in a table
   * @param {string} table - The table name
   * @param {number} id - The record ID
   * @param {Object} data - The data to update
   * @returns {Promise<boolean>} - True if successful
   */
  update(table, id, data) {
    return new Promise((resolve, reject) => {
      try {
        const setClause = Object.keys(data).map(key => `${key} = ?`).join(', ');
        const values = [...Object.values(data), id];
        
        const query = `UPDATE ${table} SET ${setClause} WHERE id = ?`;
        this.db.run(query, values, function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.changes > 0);
          }
        });
      } catch (error) {
        console.error(`Error updating ${table}:`, error);
        reject(error);
      }
    });
  }

  /**
   * Delete a record from a table
   * @param {string} table - The table name
   * @param {number} id - The record ID
   * @returns {Promise<boolean>} - True if successful
   */
  delete(table, id) {
    return new Promise((resolve, reject) => {
      try {
        const query = `DELETE FROM ${table} WHERE id = ?`;
        this.db.run(query, [id], function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.changes > 0);
          }
        });
      } catch (error) {
        console.error(`Error deleting from ${table}:`, error);
        reject(error);
      }
    });
  }

  /**
   * Run a custom query with parameters
   * @param {string} query - The SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Array|Object>} - Query results
   */
  runQuery(query, params = []) {
    return new Promise((resolve, reject) => {
      try {
        // Determine if this is a SELECT query
        if (query.trim().toLowerCase().startsWith('select')) {
          this.db.all(query, params, (err, rows) => {
            if (err) {
              reject(err);
            } else {
              resolve(rows);
            }
          });
        } else {
          this.db.run(query, params, function(err) {
            if (err) {
              reject(err);
            } else {
              resolve(this);
            }
          });
        }
      } catch (error) {
        console.error('Error running custom query:', error);
        reject(error);
      }
    });
  }

  /**
   * Close the database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.initialized = false;
      console.log('Database connection closed');
    }
  }
}

// Export a singleton instance
const dbManager = new DatabaseManager();
module.exports = dbManager;