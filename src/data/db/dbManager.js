// Enhanced Database Manager using sqlite3 for Time Tracker App
// Path: src/data/db/dbManager.js

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { app } = require('electron');

class DatabaseManager {
  constructor() {
    this.db = null;
    this.initialized = false;
    this.inTransaction = false;
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
   * Begin a database transaction
   * @returns {Promise<void>}
   */
  beginTransaction() {
    return new Promise((resolve, reject) => {
      if (!this.initialized) {
        this.initialize();
      }

      if (this.inTransaction) {
        reject(new Error('Transaction already in progress'));
        return;
      }

      this.db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          console.error('Error beginning transaction:', err);
          reject(err);
        } else {
          this.inTransaction = true;
          console.log('Transaction started');
          resolve();
        }
      });
    });
  }

  /**
   * Commit a database transaction
   * @returns {Promise<void>}
   */
  commitTransaction() {
    return new Promise((resolve, reject) => {
      if (!this.inTransaction) {
        reject(new Error('No transaction in progress'));
        return;
      }

      this.db.run('COMMIT', (err) => {
        if (err) {
          console.error('Error committing transaction:', err);
          reject(err);
        } else {
          this.inTransaction = false;
          console.log('Transaction committed');
          resolve();
        }
      });
    });
  }

  /**
   * Rollback a database transaction
   * @returns {Promise<void>}
   */
  rollbackTransaction() {
    return new Promise((resolve, reject) => {
      if (!this.inTransaction) {
        resolve(); // No transaction to rollback, just resolve
        return;
      }

      this.db.run('ROLLBACK', (err) => {
        if (err) {
          console.error('Error rolling back transaction:', err);
          reject(err);
        } else {
          this.inTransaction = false;
          console.log('Transaction rolled back');
          resolve();
        }
      });
    });
  }

  /**
   * Execute operations within a transaction
   * @param {Function} callback - Async function containing operations to execute
   * @returns {Promise<any>} - Result of the callback
   */
  async withTransaction(callback) {
    if (!this.initialized) {
      this.initialize();
    }
    
    // Check if we're already in a transaction
    const wasInTransaction = this.inTransaction;
    
    try {
      // Only begin a new transaction if we're not already in one
      if (!wasInTransaction) {
        await this.beginTransaction();
      }
      
      const result = await callback();
      
      // Only commit if we started the transaction
      if (!wasInTransaction) {
        await this.commitTransaction();
      }
      
      return result;
    } catch (error) {
      // Only rollback if we started the transaction
      if (!wasInTransaction) {
        await this.rollbackTransaction();
      }
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
        if (!this.initialized) {
          this.initialize();
        }
        
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
        if (!this.initialized) {
          this.initialize();
        }
        
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
        if (!this.initialized) {
          this.initialize();
        }
        
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
        if (!this.initialized) {
          this.initialize();
        }
        
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
        if (!this.initialized) {
          this.initialize();
        }
        
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
        if (!this.initialized) {
          this.initialize();
        }
        
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
   * Execute a SELECT query and get multiple rows
   * @param {string} query - The SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Array>} - Array of rows
   */
  all(query, params = []) {
    return new Promise((resolve, reject) => {
      try {
        if (!this.initialized) {
          this.initialize();
        }
        
        this.db.all(query, params, (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        });
      } catch (error) {
        console.error('Error executing all query:', error);
        reject(error);
      }
    });
  }

  /**
   * Execute a SELECT query and get a single row
   * @param {string} query - The SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Object|null>} - The row or null
   */
  get(query, params = []) {
    return new Promise((resolve, reject) => {
      try {
        if (!this.initialized) {
          this.initialize();
        }
        
        this.db.get(query, params, (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row || null);
          }
        });
      } catch (error) {
        console.error('Error executing get query:', error);
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