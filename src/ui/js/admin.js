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
    const applyFiltersBtn = document.getElementById('apply-filters-btn');
    
    // Modal elements
    const screenshotModal = document.getElementById('screenshot-modal');
    const closeModal = document.querySelector('.close-modal');
    const screenshotFullImage = document.getElementById('screenshot-full-image');
    const screenshotDate = document.getElementById('screenshot-date');
    const screenshotTime = document.getElementById('screenshot-time');
    const screenshotUser = document.getElementById('screenshot-user');
    const screenshotProject = document.getElementById('screenshot-project');
    
    // Date preset buttons
    const todayBtn = document.getElementById('today-btn');
    const yesterdayBtn = document.getElementById('yesterday-btn');
    const thisWeekBtn = document.getElementById('this-week-btn');
    const lastWeekBtn = document.getElementById('last-week-btn');
    const thisMonthBtn = document.getElementById('this-month-btn');
    const lastMonthBtn = document.getElementById('last-month-btn');
    const last7DaysBtn = document.getElementById('last-7-days-btn');
    const last30DaysBtn = document.getElementById('last-30-days-btn');
    
    // Filter elements
    const clientFilter = document.getElementById('client-filter');
    const projectFilter = document.getElementById('project-filter');
    
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
    
    // Apply filters button
    if (applyFiltersBtn) {
      applyFiltersBtn.addEventListener('click', loadTimeEntries);
    }
    
    // Date preset buttons
    if (todayBtn) todayBtn.addEventListener('click', setToday);
    if (yesterdayBtn) yesterdayBtn.addEventListener('click', setYesterday);
    if (thisWeekBtn) thisWeekBtn.addEventListener('click', setThisWeek);
    if (lastWeekBtn) lastWeekBtn.addEventListener('click', setLastWeek);
    if (thisMonthBtn) thisMonthBtn.addEventListener('click', setThisMonth);
    if (lastMonthBtn) lastMonthBtn.addEventListener('click', setLastMonth);
    if (last7DaysBtn) last7DaysBtn.addEventListener('click', setLast7Days);
    if (last30DaysBtn) last30DaysBtn.addEventListener('click', setLast30Days);
    
    // Client filter change event
    if (clientFilter) {
      clientFilter.addEventListener('change', () => {
        populateProjectDropdown(clientFilter.value);
      });
    }
    
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
        
        // Populate client dropdown for filtering
        await populateClientDropdown();
        
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
     * Populate client dropdown with data from API
     */
    async function populateClientDropdown() {
      try {
        if (!clientFilter) return;
        
        // Keep the first 'All Clients' option
        clientFilter.innerHTML = '<option value="all">All Clients</option>';
        
        // Add options for each client
        clients.sort((a, b) => a.name.localeCompare(b.name)).forEach(client => {
          const option = document.createElement('option');
          option.value = client.id;
          option.textContent = client.name;
          clientFilter.appendChild(option);
        });
      } catch (error) {
        console.error('Error loading clients for filter:', error);
      }
    }
    
    /**
     * Populate project dropdown based on selected client
     */
    async function populateProjectDropdown(clientId) {
      try {
        if (!projectFilter) return;
        
        // Reset to just the "All Projects" option
        projectFilter.innerHTML = '<option value="all">All Projects</option>';
        
        // If 'All Clients' is selected, don't load projects
        if (clientId === 'all') return;
        
        // Get projects for the selected client
        const projects = await window.api.invoke('project:getByClient', { clientId });
        
        // Sort projects alphabetically
        projects.sort((a, b) => a.name.localeCompare(b.name));
        
        // Add options for each project
        projects.forEach(project => {
          const option = document.createElement('option');
          option.value = project.id;
          option.textContent = project.name;
          projectFilter.appendChild(option);
        });
      } catch (error) {
        console.error('Error loading projects for filter:', error);
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
        
        // Get client and project filters if they exist
        const clientId = clientFilter ? clientFilter.value : 'all';
        const projectId = projectFilter ? projectFilter.value : 'all';
        
        // Request time entries from the backend
        const params = {
          userId: currentUser === 'all' ? null : currentUser,
          fromDate: fromDate,
          toDate: toDate,
          clientId: clientId === 'all' ? null : clientId,
          projectId: projectId === 'all' ? null : projectId
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
      
      // Calculate totals
      let totalDuration = 0;
      let totalScreenshots = 0;
      
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
        
        // Track totals
        totalDuration += entry.duration || 0;
        totalScreenshots += entry.screenshot_count || 0;
        
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
      
      // Add totals row
      const totalsRow = document.createElement('tr');
      totalsRow.className = 'totals-row';
      totalsRow.innerHTML = `
        <td colspan="6">TOTALS</td>
        <td>${formatDuration(totalDuration)}</td>
        <td>${totalScreenshots}</td>
        <td></td>
      `;
      tbody.appendChild(totalsRow);
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
          <img class="screenshot-thumbnail" src="assets/screenshot-placeholder.svg" alt="Screenshot at ${timeStr}">
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
          
          if (imageData && imageData.success && imageData.data) {
            // Convert base64 data to an image src
            imgElement.src = `data:image/png;base64,${imageData.data}`;
          } else {
            imgElement.src = 'assets/screenshot-error.svg';
            console.error('No image data returned for screenshot', screenshotId);
          }
        } else {
          imgElement.src = 'assets/screenshot-error.svg';
        }
      } catch (error) {
        imgElement.src = 'assets/screenshot-error.svg';
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
      screenshotFullImage.src = 'assets/screenshot-placeholder.svg';
      
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
        const result = await window.api.invoke('admin:deleteTimeEntry', { timeEntryId });
        
        if (result && result.success) {
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
    
    // ------ DATE PRESET FUNCTIONS ------
    
    function setToday() {
      const today = new Date();
      setDateRange(today, today);
    }
    
    function setYesterday() {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      setDateRange(yesterday, yesterday);
    }
    
    function setThisWeek() {
      const today = new Date();
      const firstDay = new Date(today);
      const day = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
      
      // Adjust to get Monday as the first day of the week
      const diff = day === 0 ? 6 : day - 1; // If Sunday, go back 6 days, otherwise go back to Monday
      firstDay.setDate(today.getDate() - diff);
      
      setDateRange(firstDay, today);
    }
    
    function setLastWeek() {
      const today = new Date();
      const lastWeekEnd = new Date(today);
      const day = today.getDay() || 7; // Get current day (0 = Sunday, convert 0 to 7)
      
      // Last Sunday
      lastWeekEnd.setDate(today.getDate() - day);
      
      // Last Monday (for the previous week)
      const lastWeekStart = new Date(lastWeekEnd);
      lastWeekStart.setDate(lastWeekEnd.getDate() - 6);
      
      setDateRange(lastWeekStart, lastWeekEnd);
    }
    
    function setThisMonth() {
      const today = new Date();
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      
      setDateRange(firstDayOfMonth, today);
    }
    
    function setLastMonth() {
      const today = new Date();
      const firstDayOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDayOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      
      setDateRange(firstDayOfLastMonth, lastDayOfLastMonth);
    }
    
    function setLast7Days() {
      const today = new Date();
      const last7Days = new Date(today);
      last7Days.setDate(today.getDate() - 6); // 6 days ago + today = 7 days
      
      setDateRange(last7Days, today);
    }
    
    function setLast30Days() {
      const today = new Date();
      const last30Days = new Date(today);
      last30Days.setDate(today.getDate() - 29); // 29 days ago + today = 30 days
      
      setDateRange(last30Days, today);
    }
    
    // Helper to set date range and trigger update
    function setDateRange(fromDate, toDate) {
      dateFromInput.value = formatDateForInput(fromDate);
      dateToInput.value = formatDateForInput(toDate);
      loadTimeEntries(); // Automatically load data with new date range
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