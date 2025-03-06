// Admin Dashboard JavaScript
// Path: src/ui/js/admin.js

document.addEventListener('DOMContentLoaded', () => {
    // ------ DOM ELEMENTS ------
    const userSelect = document.getElementById('user-select');
    const dateFromInput = document.getElementById('date-from');
    const dateToInput = document.getElementById('date-to');
    const applyDatesBtn = document.getElementById('apply-dates-btn');
    const refreshDataBtn = document.getElementById('refresh-data-btn');
    const backToAppBtn = document.getElementById('back-to-app-btn');
    const timeEntriesTable = document.getElementById('time-entries-table');
    const screenshotsContainer = document.getElementById('screenshots-container');
    const userReportBtn = document.getElementById('user-report-btn');
    const clientReportBtn = document.getElementById('client-report-btn');
    const projectReportBtn = document.getElementById('project-report-btn');
    const exportCsvBtn = document.getElementById('export-csv-btn');
    const reportResults = document.getElementById('report-results');
    
    // Modal elements
    const screenshotModal = document.getElementById('screenshot-modal');
    const closeModal = document.querySelector('.close-modal');
    const screenshotFullImage = document.getElementById('screenshot-full-image');
    const screenshotDate = document.getElementById('screenshot-date');
    const screenshotTime = document.getElementById('screenshot-time');
    const screenshotUser = document.getElementById('screenshot-user');
    const screenshotProject = document.getElementById('screenshot-project');
    
    // ------ STATE VARIABLES ------
    let currentUser = 'all'; // 'all' or user ID
    let timeEntries = [];
    let screenshots = [];
    let selectedTimeEntry = null;
    let users = [];
    let clients = [];
    let projects = [];
    
    // ------ INITIALIZATION ------
    // Set default date range (last 7 days)
    const today = new Date();
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(today.getDate() - 7);
    
    dateFromInput.value = formatDateForInput(oneWeekAgo);
    dateToInput.value = formatDateForInput(today);
    
    // Initial data loading
    initialize();
    
    // ------ EVENT LISTENERS ------
    userSelect.addEventListener('change', () => {
      currentUser = userSelect.value;
      loadTimeEntries();
    });
    
    applyDatesBtn.addEventListener('click', loadTimeEntries);
    
    refreshDataBtn.addEventListener('click', () => {
      initialize();
    });
    
    backToAppBtn.addEventListener('click', () => {
      window.location.href = 'index.html';
    });
    
    // Modal events
    closeModal.addEventListener('click', () => {
      screenshotModal.style.display = 'none';
    });
    
    window.addEventListener('click', (event) => {
      if (event.target === screenshotModal) {
        screenshotModal.style.display = 'none';
      }
    });
    
    // Report buttons
    userReportBtn.addEventListener('click', () => generateReport('user'));
    clientReportBtn.addEventListener('click', () => generateReport('client'));
    projectReportBtn.addEventListener('click', () => generateReport('project'));
    exportCsvBtn.addEventListener('click', exportToCsv);
    
    // ------ FUNCTIONS ------
    
    /**
     * Initialize the admin dashboard
     */
    async function initialize() {
      try {
        // Load users
        await loadUsers();
        
        // Load clients and projects for filtering
        await loadClientsAndProjects();
        
        // Load time entries for the selected date range
        await loadTimeEntries();
      } catch (error) {
        showError('Error initializing admin dashboard', error);
      }
    }
    
    /**
     * Load users for the dropdown
     */
    async function loadUsers() {
      try {
        // Clear dropdown
        userSelect.innerHTML = '<option value="all">All Users</option>';
        
        // Request users from the backend
        users = await window.api.invoke('admin:getUsers');
        
        // Add options for each user
        users.forEach(user => {
          const option = document.createElement('option');
          option.value = user.id;
          option.textContent = user.username;
          userSelect.appendChild(option);
        });
        
        console.log(`Loaded ${users.length} users`);
      } catch (error) {
        showError('Error loading users', error);
      }
    }
    
    /**
     * Load clients and projects for reporting
     */
    async function loadClientsAndProjects() {
      try {
        // Load clients
        clients = await window.api.invoke('client:getAll');
        console.log(`Loaded ${clients.length} clients`);
        
        // We'll load projects as needed when filtering
      } catch (error) {
        showError('Error loading clients and projects', error);
      }
    }
    
    /**
     * Load time entries based on selected user and date range
     */
    async function loadTimeEntries() {
      try {
        // Get date range
        const fromDate = dateFromInput.value;
        const toDate = dateToInput.value;
        
        if (!fromDate || !toDate) {
          showError('Please select a valid date range');
          return;
        }
        
        // Request time entries from the backend
        const params = {
          userId: currentUser === 'all' ? null : currentUser,
          fromDate: fromDate,
          toDate: toDate
        };
        
        // Show loading state
        timeEntriesTable.querySelector('tbody').innerHTML = '<tr><td colspan="9">Loading time entries...</td></tr>';
        screenshotsContainer.innerHTML = '<div class="placeholder-message">Loading...</div>';
        
        timeEntries = await window.api.invoke('admin:getTimeEntries', params);
        console.log(`Loaded ${timeEntries.length} time entries`);
        
        // Display time entries
        displayTimeEntries();
        
        // Clear screenshots when time entries change
        clearScreenshots();
      } catch (error) {
        showError('Error loading time entries', error);
      }
    }
    
    /**
     * Display time entries in the table
     */
    function displayTimeEntries() {
      const tbody = timeEntriesTable.querySelector('tbody');
      tbody.innerHTML = '';
      
      if (timeEntries.length === 0) {
        tbody.innerHTML = '<tr class="placeholder-row"><td colspan="9">No time entries found for the selected criteria</td></tr>';
        return;
      }
      
      // Sort entries by date (newest first)
      timeEntries.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
      
      timeEntries.forEach(entry => {
        const row = document.createElement('tr');
        row.dataset.entryId = entry.id;
        
        // Flag edited or manual entries
        if (entry.is_edited || entry.is_manual) {
          row.classList.add('edited-entry');
        }
        
        // Format dates and times
        const startDate = new Date(entry.start_time);
        const dateStr = formatDate(startDate);
        const startTimeStr = formatTime(startDate);
        const endTimeStr = entry.end_time ? formatTime(new Date(entry.end_time)) : '-';
        const durationStr = formatDuration(entry.duration);
        
        // Find user, client and project names
        const userName = getUserName(entry.user_id);
        const clientName = getClientName(entry.client_id);
        const projectName = getProjectName(entry.project_id);
        
        row.innerHTML = `
          <td>${dateStr}</td>
          <td>${userName}</td>
          <td>${clientName}</td>
          <td>${projectName}</td>
          <td>${startTimeStr}</td>
          <td>${endTimeStr}</td>
          <td>${durationStr}</td>
          <td>${entry.screenshot_count || 0}</td>
          <td>
            <button class="action-btn view-btn">View</button>
            <button class="action-btn delete delete-btn">Delete</button>
          </td>
        `;
        
        // Add click event to view screenshots
        row.querySelector('.view-btn').addEventListener('click', () => {
          loadScreenshots(entry.id);
          selectedTimeEntry = entry;
          
          // Highlight the selected row
          const previousSelected = timeEntriesTable.querySelector('tr.selected');
          if (previousSelected) {
            previousSelected.classList.remove('selected');
          }
          row.classList.add('selected');
        });
        
        // Add click event to delete time entry
        row.querySelector('.delete-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm(`Are you sure you want to delete this time entry for ${userName}?`)) {
            deleteTimeEntry(entry.id);
          }
        });
        
        tbody.appendChild(row);
      });
    }
    
    /**
     * Load screenshots for a specific time entry
     */
    async function loadScreenshots(timeEntryId) {
      try {
        // Show loading state
        screenshotsContainer.innerHTML = '<div class="placeholder-message">Loading screenshots...</div>';
        
        // Request screenshots from the backend
        screenshots = await window.api.invoke('admin:getScreenshots', { timeEntryId });
        console.log(`Loaded ${screenshots.length} screenshots`);
        
        // Display screenshots
        displayScreenshots();
      } catch (error) {
        showError('Error loading screenshots', error);
      }
    }
    
    /**
     * Display screenshots in the grid
     */
    function displayScreenshots() {
      screenshotsContainer.innerHTML = '';
      
      if (screenshots.length === 0) {
        screenshotsContainer.innerHTML = '<div class="placeholder-message">No screenshots available for this time entry</div>';
        return;
      }
      
      // Sort screenshots by timestamp
      screenshots.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      
      screenshots.forEach(screenshot => {
        const screenshotTime = new Date(screenshot.timestamp);
        const timeStr = formatTime(screenshotTime);
        
        const screenshotDiv = document.createElement('div');
        screenshotDiv.className = 'screenshot-item';
        screenshotDiv.dataset.id = screenshot.id;
        
        // Use placeholder for the actual src for now
        // In real implementation, we would request the actual image data
        screenshotDiv.innerHTML = `
          <img class="screenshot-thumbnail" src="screenshot-placeholder.png" alt="Screenshot at ${timeStr}">
          <div class="screenshot-info">
            <div class="screenshot-time">${timeStr}</div>
            <div class="screenshot-date">${formatDate(screenshotTime)}</div>
          </div>
        `;
        
        // Actually load the screenshot
        const thumbnailImg = screenshotDiv.querySelector('.screenshot-thumbnail');
        loadScreenshotImage(screenshot.id, thumbnailImg);
        
        // Add click event to open the modal
        thumbnailImg.addEventListener('click', () => {
          openScreenshotModal(screenshot);
        });
        
        screenshotsContainer.appendChild(screenshotDiv);
      });
    }
    
    /**
     * Load the actual screenshot image
     */
    async function loadScreenshotImage(screenshotId, imgElement) {
      try {
        // Get the actual path to the screenshot
        const screenshot = screenshots.find(s => s.id === screenshotId);
        
        if (screenshot && screenshot.filepath) {
          // For the admin panel, we'll use a special IPC call to get the image data
          const imageData = await window.api.invoke('admin:getScreenshotData', { screenshotId });
          
          if (imageData && imageData.data) {
            // Convert base64 data to an image src
            imgElement.src = `data:image/png;base64,${imageData.data}`;
          } else {
            imgElement.src = 'screenshot-error.png';
            console.error('No image data returned for screenshot', screenshotId);
          }
        } else {
          imgElement.src = 'screenshot-error.png';
        }
      } catch (error) {
        imgElement.src = 'screenshot-error.png';
        console.error('Error loading screenshot image:', error);
      }
    }
    
    /**
     * Open the screenshot modal
     */
    function openScreenshotModal(screenshot) {
      // Set modal content
      const screenshotTime = new Date(screenshot.timestamp);
      
      screenshotDate.textContent = formatDate(screenshotTime);
      screenshotTime.textContent = formatTime(screenshotTime);
      
      // Get user and project info
      if (selectedTimeEntry) {
        screenshotUser.textContent = getUserName(selectedTimeEntry.user_id);
        screenshotProject.textContent = getProjectName(selectedTimeEntry.project_id);
      } else {
        screenshotUser.textContent = 'Unknown';
        screenshotProject.textContent = 'Unknown';
      }
      
      // Load the full-size image
      screenshotFullImage.src = 'loading.gif';
      
      loadScreenshotImage(screenshot.id, screenshotFullImage);
      
      // Show the modal
      screenshotModal.style.display = 'block';
    }
    
    /**
     * Clear screenshots display
     */
    function clearScreenshots() {
      screenshotsContainer.innerHTML = '<div class="placeholder-message">Select a time entry to view screenshots</div>';
      screenshots = [];
    }
    
    /**
     * Delete a time entry
     */
    async function deleteTimeEntry(timeEntryId) {
      try {
        const success = await window.api.invoke('admin:deleteTimeEntry', { timeEntryId });
        
        if (success) {
          // Remove from our local array
          timeEntries = timeEntries.filter(entry => entry.id !== timeEntryId);
          
          // Update display
          displayTimeEntries();
          
          // Clear screenshots if the selected entry was deleted
          if (selectedTimeEntry && selectedTimeEntry.id === timeEntryId) {
            clearScreenshots();
            selectedTimeEntry = null;
          }
        } else {
          showError('Failed to delete time entry');
        }
      } catch (error) {
        showError('Error deleting time entry', error);
      }
    }
    
    /**
     * Generate a report based on the type
     */
    function generateReport(type) {
      reportResults.innerHTML = '<div class="report-loading">Generating report...</div>';
      
      // Get date range
      const fromDate = dateFromInput.value;
      const toDate = dateToInput.value;
      
      if (!fromDate || !toDate) {
        showError('Please select a valid date range for the report');
        return;
      }
      
      const params = {
        type: type,
        userId: currentUser === 'all' ? null : currentUser,
        fromDate: fromDate,
        toDate: toDate
      };
      
      window.api.invoke('admin:generateReport', params)
        .then(reportData => {
          displayReport(type, reportData);
        })
        .catch(error => {
          showError('Error generating report', error);
        });
    }
    
    /**
     * Display a report in the results section
     */
    function displayReport(type, data) {
      if (!data || data.length === 0) {
        reportResults.innerHTML = '<div class="report-empty">No data available for the selected criteria</div>';
        return;
      }
      
      let html = '';
      
      switch (type) {
        case 'user':
          html = generateUserReport(data);
          break;
        case 'client':
          html = generateClientReport(data);
          break;
        case 'project':
          html = generateProjectReport(data);
          break;
      }
      
      reportResults.innerHTML = html;
    }
    
    /**
     * Generate HTML for user report
     */
    function generateUserReport(data) {
      let html = '<h3>User Time Report</h3>';
      html += '<table class="report-table">';
      html += '<thead><tr><th>User</th><th>Total Hours</th><th>Billable Hours</th><th>Entry Count</th></tr></thead>';
      html += '<tbody>';
      
      data.forEach(item => {
        html += `<tr>
          <td>${item.username}</td>
          <td>${formatHours(item.totalHours)}</td>
          <td>${formatHours(item.billableHours)}</td>
          <td>${item.entryCount}</td>
        </tr>`;
      });
      
      html += '</tbody></table>';
      return html;
    }
    
    /**
     * Generate HTML for client report
     */
    function generateClientReport(data) {
      let html = '<h3>Client Time Report</h3>';
      html += '<table class="report-table">';
      html += '<thead><tr><th>Client</th><th>Total Hours</th><th>Billable Hours</th><th>Entry Count</th></tr></thead>';
      html += '<tbody>';
      
      data.forEach(item => {
        html += `<tr>
          <td>${item.clientName}</td>
          <td>${formatHours(item.totalHours)}</td>
          <td>${formatHours(item.billableHours)}</td>
          <td>${item.entryCount}</td>
        </tr>`;
      });
      
      html += '</tbody></table>';
      return html;
    }
    
    /**
     * Generate HTML for project report
     */
    function generateProjectReport(data) {
      let html = '<h3>Project Time Report</h3>';
      html += '<table class="report-table">';
      html += '<thead><tr><th>Client</th><th>Project</th><th>Total Hours</th><th>Billable Hours</th><th>Entry Count</th></tr></thead>';
      html += '<tbody>';
      
      data.forEach(item => {
        html += `<tr>
          <td>${item.clientName}</td>
          <td>${item.projectName}</td>
          <td>${formatHours(item.totalHours)}</td>
          <td>${formatHours(item.billableHours)}</td>
          <td>${item.entryCount}</td>
        </tr>`;
      });
      
      html += '</tbody></table>';
      return html;
    }
    
    /**
     * Export current time entries to CSV
     */
    function exportToCsv() {
      if (!timeEntries || timeEntries.length === 0) {
        showError('No data to export');
        return;
      }
      
      // Create CSV header row
      let csv = 'Date,User,Client,Project,Start Time,End Time,Duration,Billable,Notes\n';
      
      // Add each time entry as a row
      timeEntries.forEach(entry => {
        const startDate = new Date(entry.start_time);
        const dateStr = formatDate(startDate);
        const startTimeStr = formatTime(startDate);
        const endTimeStr = entry.end_time ? formatTime(new Date(entry.end_time)) : '';
        const durationStr = formatDuration(entry.duration);
        
        const userName = getUserName(entry.user_id);
        const clientName = getClientName(entry.client_id);
        const projectName = getProjectName(entry.project_id);
        
        // Escape notes to handle commas and quotes
        const notes = entry.notes ? `"${entry.notes.replace(/"/g, '""')}"` : '';
        
        csv += `${dateStr},${userName},${clientName},${projectName},${startTimeStr},${endTimeStr},${durationStr},${entry.is_billable ? 'Yes' : 'No'},${notes}\n`;
      });
      
      // Create a download link
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `time-entries-${formatDateForFilename(new Date())}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    
    /**
     * Show an error message
     */
    function showError(message, error) {
      console.error(message, error);
      alert(`${message}: ${error ? error.message || error : 'Unknown error'}`);
    }
    
    // ------ HELPER FUNCTIONS ------
    
    /**
     * Format a date for input fields (YYYY-MM-DD)
     */
    function formatDateForInput(date) {
      return date.toISOString().split('T')[0];
    }
    
    /**
     * Format a date for display (MM/DD/YYYY)
     */
    function formatDate(date) {
      return date.toLocaleDateString();
    }
    
    /**
     * Format a time for display (HH:MM AM/PM)
     */
    function formatTime(date) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    /**
     * Format a duration in seconds to HH:MM:SS
     */
    function formatDuration(seconds) {
      if (!seconds) return '00:00:00';
      
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    /**
     * Format hours for display (with 2 decimal places)
     */
    function formatHours(hours) {
      return hours.toFixed(2);
    }
    
    /**
     * Format a date for a filename (YYYY-MM-DD)
     */
    function formatDateForFilename(date) {
      return date.toISOString().split('T')[0];
    }
    
    /**
     * Get user name from user ID
     */
    function getUserName(userId) {
      const user = users.find(u => u.id === userId);
      return user ? user.username : 'Unknown User';
    }
    
    /**
     * Get client name from client ID
     */
    function getClientName(clientId) {
      const client = clients.find(c => c.id === clientId);
      return client ? client.name : 'Unknown Client';
    }
    
    /**
     * Get project name from project ID
     */
    function getProjectName(projectId) {
      // Project list might not be fully loaded yet
      const project = projects.find(p => p.id === projectId);
      return project ? project.name : 'Unknown Project';
    }
  });