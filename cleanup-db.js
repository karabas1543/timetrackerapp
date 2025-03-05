// cleanup-db.js
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

// Initialize manually since we're not using the app object
const userDataPath = app.getPath('userData');
const dbPath = path.join(userDataPath, 'database');
const dbFile = path.join(dbPath, 'timetracker.db');

console.log('Connecting to database at:', dbFile);

// Make sure the database exists
if (!fs.existsSync(dbFile)) {
  console.error('Database file not found!');
  process.exit(1);
}

// Connect to the database
const db = new sqlite3.Database(dbFile);

// Run cleanup queries
db.serialize(() => {
  // Get current counts
  db.get('SELECT COUNT(*) as count FROM clients', (err, row) => {
    if (err) {
      console.error('Error getting client count:', err);
    } else {
      console.log(`Starting with ${row.count} clients`);
    }
  });
  
  db.get('SELECT COUNT(*) as count FROM projects', (err, row) => {
    if (err) {
      console.error('Error getting project count:', err);
    } else {
      console.log(`Starting with ${row.count} projects`);
    }
  });
  
  // Delete all but the first 3 clients (keeping Client A, Client B, Internal)
  db.run(`DELETE FROM clients WHERE id NOT IN (SELECT id FROM clients LIMIT 3)`, function(err) {
    if (err) {
      console.error('Error cleaning up clients:', err);
    } else {
      console.log(`Deleted ${this.changes} clients`);
    }
  });
  
  // Delete all but 4 projects (the original ones)
  db.run(`DELETE FROM projects WHERE id NOT IN (SELECT id FROM projects LIMIT 4)`, function(err) {
    if (err) {
      console.error('Error cleaning up projects:', err);
    } else {
      console.log(`Deleted ${this.changes} projects`);
    }
  });
  
  // Get final counts
  db.get('SELECT COUNT(*) as count FROM clients', (err, row) => {
    if (err) {
      console.error('Error getting client count:', err);
    } else {
      console.log(`Finished with ${row.count} clients`);
    }
  });
  
  db.get('SELECT COUNT(*) as count FROM projects', (err, row) => {
    if (err) {
      console.error('Error getting project count:', err);
    } else {
      console.log(`Finished with ${row.count} projects`);
    }
  });
});

// Close the database connection when done
db.close(err => {
  if (err) {
    console.error('Error closing database:', err);
    process.exit(1);
  }
  console.log('Database cleanup complete!');
  process.exit(0);
});