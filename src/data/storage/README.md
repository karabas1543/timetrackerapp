# Drive Module for Time Tracker App

## Overview

The Drive module handles synchronization of time entries and screenshots to Google Drive, 
as well as cleanup of old data based on retention policies.

## Structure

The module has been broken down into smaller, more focused components:

- **driveManager.js**: Base class for Google Drive authentication and file operations
- **driveTimeEntrySync.js**: Handles time entry synchronization
- **driveScreenshotSync.js**: Handles screenshot synchronization
- **driveCleanup.js**: Manages retention and cleanup of old data
- **index.js**: Exports all components for easy importing

## Main Integration

The main integration point is still through the `driveStore.js` file in the parent directory, 
which creates instances of all components and coordinates their operation.

## Transaction Support

All database operations now use transaction support to ensure data integrity, 
especially during sync operations that involve multiple database updates.

## Usage

You don't need to directly use the components in this module. Instead, use the `driveStore` 
singleton from the parent directory:

```javascript
const driveStore = require('../data/storage/driveStore');

// Initialize
await driveStore.initialize();

// Sync data
const results = await driveStore.syncPendingData();

// Start automatic sync
driveStore.startAutoSync(15); // Every 15 minutes
```

## Error Handling

The module now includes better error handling with specific error messages for each type of error.
All sync operations are wrapped in a `syncWithErrorHandling` method that properly updates
the sync status in the database.

## Cleanup

Data cleanup is now managed by a dedicated class that follows the retention policy
(default: 365 days) and deletes old files from Google Drive.