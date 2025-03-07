// Admin Dashboard JavaScript
// Path: src/ui/js/admin.js

document.addEventListener('DOMContentLoaded', function() {
  // DOM elements
  const userSelect = document.getElementById('user-select');
  const dateFrom = document.getElementById('date-from');
  const dateTo = document.getElementById('date-to');
  const applyDatesBtn = document.getElementById('apply-dates-btn');
  const refreshDataBtn = document.getElementById('refresh-data-btn');
  const toggleSourceBtn = document.getElementById('toggle-source-btn');
  const refreshVpsBtn = document.getElementById('refresh-drive-btn');
  const clearCacheBtn = document.getElementById('clear-cache-btn');
  const backToAppBtn = document.getElementById('back-to-app-btn');
  const dataSourceText = document.getElementById('data-source-text');
  const lastSyncText = document.getElementById('last-sync-text');
  const dataSourceLoading = document.getElementById('data-source-loading');
  const clientFilter = document.getElementById('client-filter');
  const projectFilter = document.getElementById('project-filter');
  const applyFiltersBtn = document.getElementById('apply-filters-btn');
  const timeEntriesTable = document.getElementById('time-entries-table');
  const screenshotsContainer = document.getElementById('screenshots-container');
  const reportButtons = document.querySelectorAll('.report-buttons button');
  const reportResults = document.getElementById('report-results');
  
  // Date preset buttons
  const todayBtn = document.getElementById('today-btn');
  const yesterdayBtn = document.getElementById('yesterday-btn');
  const thisWeekBtn = document.getElementById('this-week-btn');
  const lastWeekBtn = document.getElementById('last-week-btn');
  const thisMonthBtn = document.getElementById('this-month-btn');
  const lastMonthBtn = document.getElementById('last-month-btn');
  const last7DaysBtn = document.getElementById('last-7-days-btn');
  const last30DaysBtn = document.getElementById('last-30-days-btn');
  
  // Modal elements
  const screenshotModal = document.getElementById('screenshot-modal');
  const closeModal = document.querySelector('.close-modal');
  const screenshotFullImage = document.getElementById('screenshot-full-image');
  const screenshotDate = document.getElementById('screenshot-date');
  const screenshotTime = document.getElementById('screenshot-time');
  const screenshotUser = document.getElementById('screenshot-user');
  const screenshotProject = document.getElementById('screenshot-project');
  const screenshotSource = document.getElementById('screenshot-source');
  
  // State
  let currentUser = 'all';
  let currentDateRange = {
    from: getDefaultFromDate(),
    to: getDefaultToDate()
  };
  let currentTimeEntry = null;
  let currentFilters = {
    clientId: 'all',
    projectId: 'all'
  };
  let isUsingVps = true;
  
  // Initialize
  init();
  
  // Initialize the admin dashboard
  async function init() {
    // Set default date range
    dateFrom.value = currentDateRange.from;
    dateTo.value = currentDateRange.to;
    
    // Get data source status
    await updateDataSourceStatus();
    
    // Load users
    await loadUsers();
    
    // Load clients
    await loadClients();
    
    // Load initial data
    await loadTimeEntries();
    
    // Add event listeners
    setupEventListeners();
  }
  
  // Set up event listeners
  function setupEventListeners() {
    userSelect.addEventListener('change', onUserChange);
    applyDatesBtn.addEventListener('click', onApplyDates);
    refreshDataBtn.addEventListener('click', onRefreshData);
    toggleSourceBtn.addEventListener('click', onToggleDataSource);
    refreshVpsBtn.addEventListener('click', onRefreshFromVps);
    clearCacheBtn.addEventListener('click', onClearCache);
    backToAppBtn.addEventListener('click', () => window.location.href = 'index.html');
    
    // Date preset buttons
    todayBtn.addEventListener('click', () => setDatePreset('today'));
    yesterdayBtn.addEventListener('click', () => setDatePreset('yesterday'));
    thisWeekBtn.addEventListener('click', () => setDatePreset('thisWeek'));
    lastWeekBtn.addEventListener('click', () => setDatePreset('lastWeek'));
    thisMonthBtn.addEventListener('click', () => setDatePreset('thisMonth'));
    lastMonthBtn.addEventListener('click', () => setDatePreset('lastMonth'));
    last7DaysBtn.addEventListener('click', () => setDatePreset('last7Days'));
    last30DaysBtn.addEventListener('click', () => setDatePreset('last30Days'));
    
    // Client and project filters
    clientFilter.addEventListener('change', onClientChange);
    applyFiltersBtn.addEventListener('click', onApplyFilters);
    
    // Report buttons
    document.getElementById('user-report-btn').addEventListener('click', () => generateReport('user'));
    document.getElementById('client-report-btn').addEventListener('click', () => generateReport('client'));
    document.getElementById('project-report-btn').addEventListener('click', () => generateReport('project'));
    document.getElementById('export-csv-btn').addEventListener('click', exportToCSV);
    
    // Modal close button
    closeModal.addEventListener('click', () => {
      screenshotModal.style.display = 'none';
    });
    
    // Close modal when clicking outside
    window.addEventListener('click', (event) => {
      if (event.target === screenshotModal) {
        screenshotModal.style.display = 'none';
      }
    });
  }
  
  // Update data source status
  async function updateDataSourceStatus() {
    try {
      const status = await window.api.invoke('admin:getDataSourceStatus');
      isUsingVps = status.useVps;
      
      // Update UI to reflect data source
      dataSourceText.textContent = isUsingVps ? 'VPS Server' : 'Local Database';
      toggleSourceBtn.textContent = isUsingVps ? 'Switch to Local' : 'Switch to VPS';
      
      // Update button states
      refreshVpsBtn.disabled = !isUsingVps;
      clearCacheBtn.disabled = !isUsingVps;
      
      // Get last sync time
      if (isUsingVps && status.initialized) {
        const syncData = await window.api.invoke('admin:getSyncStatus');
        if (syncData && syncData.lastSync) {
          const lastSync = new Date(syncData.lastSync);
          lastSyncText.textContent = formatDateTime(lastSync);
        } else {
          lastSyncText.textContent = 'Never';
        }
      } else {
        lastSyncText.textContent = 'N/A (Using Local Data)';
      }
    } catch (error) {
      console.error('Error getting data source status:', error);
      showError('Failed to get data source status');
    }
  }
  
  // Load users
  async function loadUsers() {
    try {
      const users = await window.api.invoke('admin:getUsers');
      
      // Clear options except "all"
      while (userSelect.options.length > 1) {
        userSelect.remove(1);
      }
      
      // Add users
      users.forEach(user => {
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = user.username;
        userSelect.appendChild(option);
      });
    } catch (error) {
      console.error('Error loading users:', error);
      showError('Failed to load users');
    }
  }
  
  // Load clients
  async function loadClients() {
    try {
      const clients = await window.api.invoke('client:getAll');
      
      // Clear options except "all"
      while (clientFilter.options.length > 1) {
        clientFilter.remove(1);
      }
      
      // Add clients
      clients.forEach(client => {
        const option = document.createElement('option');
        option.value = client.id;
        option.textContent = client.name;
        clientFilter.appendChild(option);
      });
    } catch (error) {
      console.error('Error loading clients:', error);
      showError('Failed to load clients');
    }
  }
  
  // Load projects for a client
  async function loadProjects(clientId) {
    try {
      // Clear existing options except "all"
      while (projectFilter.options.length > 1) {
        projectFilter.remove(1);
      }
      
      if (clientId === 'all') {
        return; // No need to load projects
      }
      
      const projects = await window.api.invoke('project:getByClient', { clientId });
      
      // Add projects
      projects.forEach(project => {
        const option = document.createElement('option');
        option.value = project.id;
        option.textContent = project.name;
        projectFilter.appendChild(option);
      });
    } catch (error) {
      console.error('Error loading projects:', error);
      showError('Failed to load projects');
    }
  }
  
  // Load time entries
  async function loadTimeEntries() {
    try {
      showLoading(true);
      
      const timeEntries = await window.api.invoke('admin:getTimeEntries', {
        userId: currentUser,
        fromDate: currentDateRange.from,
        toDate: currentDateRange.to,
        clientId: currentFilters.clientId,
        projectId: currentFilters.projectId
      });
      
      renderTimeEntries(timeEntries);
      showLoading(false);
    } catch (error) {
      console.error('Error loading time entries:', error);
      showError('Failed to load time entries');
      showLoading(false);
    }
  }
  
  // Render time entries to the table
  function renderTimeEntries(timeEntries) {
    // Clear table (keep header)
    const tbody = timeEntriesTable.querySelector('tbody');
    tbody.innerHTML = '';
    
    if (timeEntries.length === 0) {
      const row = document.createElement('tr');
      row.className = 'placeholder-row';
      row.innerHTML = '<td colspan="9">No time entries found for the selected filters</td>';
      tbody.appendChild(row);
      return;
    }
    
    // Sort time entries by start time (newest first)
    timeEntries.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
    
    // Render each time entry
    timeEntries.forEach(entry => {
      const row = document.createElement('tr');
      row.dataset.id = entry.id;
      
      // Format dates
      const startDate = new Date(entry.start_time);
      const startFormatted = formatDateTime(startDate);
      const endFormatted = entry.end_time ? formatDateTime(new Date(entry.end_time)) : 'Running';
      
      // Calculate duration display
      const durationDisplay = formatDuration(entry.duration || 0);
      
      // Create row content
      row.innerHTML = `
        <td>${formatDate(startDate)}</td>
        <td>${entry.user?.username || 'Unknown'}</td>
        <td>${entry.client?.name || 'Unknown Client'}</td>
        <td>${entry.project?.name || 'Unknown Project'}</td>
        <td>${formatTime(startDate)}</td>
        <td>${entry.end_time ? formatTime(new Date(entry.end_time)) : 'Running'}</td>
        <td>${durationDisplay}</td>
        <td>${entry.screenshot_count || 0}</td>
        <td>
          <button class="view-screenshots-btn" data-id="${entry.id}">View</button>
          <button class="delete-entry-btn" data-id="${entry.id}">Delete</button>
        </td>
      `;
      
      // Add to table
      tbody.appendChild(row);
      
      // Add event listeners for buttons
      row.querySelector('.view-screenshots-btn').addEventListener('click', () => {
        loadScreenshots(entry.id);
        currentTimeEntry = entry;
      });
      
      row.querySelector('.delete-entry-btn').addEventListener('click', () => {
        if (confirm('Are you sure you want to delete this time entry? This action cannot be undone.')) {
          deleteTimeEntry(entry.id);
        }
      });
    });
  }
  
  // Load screenshots for a time entry
  async function loadScreenshots(timeEntryId) {
    try {
      showLoading(true);
      
      screenshotsContainer.innerHTML = '<div class="loading-message">Loading screenshots...</div>';
      
      const screenshots = await window.api.invoke('admin:getScreenshots', { timeEntryId });
      
      renderScreenshots(screenshots, timeEntryId);
      showLoading(false);
    } catch (error) {
      console.error('Error loading screenshots:', error);
      screenshotsContainer.innerHTML = '<div class="error-message">Failed to load screenshots</div>';
      showLoading(false);
    }
  }
  
  // Render screenshots to the container
  function renderScreenshots(screenshots, timeEntryId) {
    screenshotsContainer.innerHTML = '';
    
    if (screenshots.length === 0) {
      screenshotsContainer.innerHTML = '<div class="placeholder-message">No screenshots available for this time entry</div>';
      return;
    }
    
    // Sort screenshots by timestamp
    screenshots.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    // Create screenshots grid
    screenshots.forEach(screenshot => {
      const screenshotElement = document.createElement('div');
      screenshotElement.className = 'screenshot-item';
      screenshotElement.dataset.id = screenshot.id;
      
      // Create thumbnail placeholder
      screenshotElement.innerHTML = `
        <div class="screenshot-thumbnail">
          <div class="screenshot-loading">Loading...</div>
        </div>
        <div class="screenshot-info">
          <div class="screenshot-time">${formatTime(new Date(screenshot.timestamp))}</div>
          <div class="screenshot-source">${screenshot.is_from_vps ? 'VPS' : 'Local'}</div>
        </div>
      `;
      
      // Add to container
      screenshotsContainer.appendChild(screenshotElement);
      
      // Load actual screenshot data
      loadScreenshotData(screenshot, screenshotElement);
      
      // Add click event to show full image in modal
      screenshotElement.addEventListener('click', () => {
        showScreenshotModal(screenshot);
      });
    });
  }
  
  // Load screenshot data (image)
  async function loadScreenshotData(screenshot, element) {
    try {
      const result = await window.api.invoke('admin:getScreenshotData', { 
        screenshotId: screenshot.id,
        isFromVps: screenshot.is_from_vps
      });
      
      if (result.success) {
        // Create image from base64 data
        const thumbnail = element.querySelector('.screenshot-thumbnail');
        thumbnail.innerHTML = '';
        const img = document.createElement('img');
        img.src = `data:image/png;base64,${result.data}`;
        img.alt = 'Screenshot';
        thumbnail.appendChild(img);
      } else {
        // Show error
        const thumbnail = element.querySelector('.screenshot-thumbnail');
        thumbnail.innerHTML = '<div class="screenshot-error">Failed to load image</div>';
      }
    } catch (error) {
      console.error('Error loading screenshot data:', error);
      const thumbnail = element.querySelector('.screenshot-thumbnail');
      thumbnail.innerHTML = '<div class="screenshot-error">Error</div>';
    }
  }
  
  // Show screenshot in modal
  async function showScreenshotModal(screenshot) {
    try {
      // Show loading state
      screenshotFullImage.src = '';
      screenshotModal.style.display = 'block';
      
      // Set screenshot metadata
      const timestamp = new Date(screenshot.timestamp);
      screenshotDate.textContent = formatDate(timestamp);
      screenshotTime.textContent = formatTime(timestamp);
      screenshotUser.textContent = currentTimeEntry?.user?.username || 'Unknown';
      screenshotProject.textContent = currentTimeEntry?.project?.name || 'Unknown Project';
      screenshotSource.textContent = screenshot.is_from_vps ? 'VPS Server' : 'Local Storage';
      
      // Load full image
      const result = await window.api.invoke('admin:getScreenshotData', { 
        screenshotId: screenshot.id,
        isFromVps: screenshot.is_from_vps
      });
      
      if (result.success) {
        screenshotFullImage.src = `data:image/png;base64,${result.data}`;
      } else {
        alert('Failed to load full image: ' + result.error);
      }
    } catch (error) {
      console.error('Error showing screenshot in modal:', error);
      alert('Failed to load full image');
    }
  }
  
  // Delete a time entry
  async function deleteTimeEntry(timeEntryId) {
    try {
      showLoading(true);
      
      const result = await window.api.invoke('admin:deleteTimeEntry', { timeEntryId });
      
      if (result.success) {
        // Refresh time entries
        await loadTimeEntries();
        // Clear screenshots if we were viewing that entry
        if (currentTimeEntry && currentTimeEntry.id === timeEntryId) {
          screenshotsContainer.innerHTML = '<div class="placeholder-message">Select a time entry to view screenshots</div>';
          currentTimeEntry = null;
        }
      } else {
        showError('Failed to delete time entry: ' + result.error);
      }
      
      showLoading(false);
    } catch (error) {
      console.error('Error deleting time entry:', error);
      showError('Failed to delete time entry');
      showLoading(false);
    }
  }
  
  // Generate a report
  async function generateReport(type) {
    try {
      showLoading(true);
      
      const reportData = await window.api.invoke('admin:generateReport', {
        type,
        userId: currentUser,
        fromDate: currentDateRange.from,
        toDate: currentDateRange.to
      });
      
      renderReport(type, reportData);
      showLoading(false);
    } catch (error) {
      console.error(`Error generating ${type} report:`, error);
      showError(`Failed to generate ${type} report`);
      showLoading(false);
    }
  }
  
  // Render a report
  function renderReport(type, data) {
    if (!data || data.length === 0) {
      reportResults.innerHTML = '<div class="no-data-message">No data available for the selected report</div>';
      return;
    }
    
    // Create the report based on type
    let reportHtml = `<h3>${capitalizeFirstLetter(type)} Report</h3>`;
    reportHtml += '<table class="report-table">';
    
    switch (type) {
      case 'user':
        reportHtml += `
          <thead>
            <tr>
              <th>User</th>
              <th>Entries</th>
              <th>Total Hours</th>
              <th>Billable Hours</th>
              <th>Billable %</th>
            </tr>
          </thead>
          <tbody>
        `;
        
        data.forEach(item => {
          const billablePercentage = item.totalHours > 0 
            ? ((item.billableHours / item.totalHours) * 100).toFixed(1) 
            : '0.0';
            
          reportHtml += `
            <tr>
              <td>${item.username}</td>
              <td>${item.entryCount}</td>
              <td>${item.totalHours.toFixed(2)}</td>
              <td>${item.billableHours.toFixed(2)}</td>
              <td>${billablePercentage}%</td>
            </tr>
          `;
        });
        break;
        
      case 'client':
        reportHtml += `
          <thead>
            <tr>
              <th>Client</th>
              <th>Entries</th>
              <th>Total Hours</th>
              <th>Billable Hours</th>
              <th>Billable %</th>
            </tr>
          </thead>
          <tbody>
        `;
        
        data.forEach(item => {
          const billablePercentage = item.totalHours > 0 
            ? ((item.billableHours / item.totalHours) * 100).toFixed(1) 
            : '0.0';
            
          reportHtml += `
            <tr>
              <td>${item.clientName}</td>
              <td>${item.entryCount}</td>
              <td>${item.totalHours.toFixed(2)}</td>
              <td>${item.billableHours.toFixed(2)}</td>
              <td>${billablePercentage}%</td>
            </tr>
          `;
        });
        break;
        
      case 'project':
        reportHtml += `
          <thead>
            <tr>
              <th>Project</th>
              <th>Client</th>
              <th>Entries</th>
              <th>Total Hours</th>
              <th>Billable Hours</th>
              <th>Billable %</th>
            </tr>
          </thead>
          <tbody>
        `;
        
        data.forEach(item => {
          const billablePercentage = item.totalHours > 0 
            ? ((item.billableHours / item.totalHours) * 100).toFixed(1) 
            : '0.0';
            
          reportHtml += `
            <tr>
              <td>${item.projectName}</td>
              <td>${item.clientName}</td>
              <td>${item.entryCount}</td>
              <td>${item.totalHours.toFixed(2)}</td>
              <td>${item.billableHours.toFixed(2)}</td>
              <td>${billablePercentage}%</td>
            </tr>
          `;
        });
        break;
    }
    
    reportHtml += '</tbody></table>';
    
    // Add summary
    const totalHours = data.reduce((sum, item) => sum + item.totalHours, 0);
    const billableHours = data.reduce((sum, item) => sum + item.billableHours, 0);
    const totalBillablePercentage = totalHours > 0 
      ? ((billableHours / totalHours) * 100).toFixed(1) 
      : '0.0';
      
    reportHtml += `
      <div class="report-summary">
        <div><strong>Total Hours:</strong> ${totalHours.toFixed(2)}</div>
        <div><strong>Billable Hours:</strong> ${billableHours.toFixed(2)}</div>
        <div><strong>Billable Percentage:</strong> ${totalBillablePercentage}%</div>
      </div>
    `;
    
    reportResults.innerHTML = reportHtml;
  }
  
  // Export report to CSV
  function exportToCSV() {
    // Get current report table
    const reportTable = reportResults.querySelector('.report-table');
    
    if (!reportTable) {
      alert('No report data to export. Please generate a report first.');
      return;
    }
    
    // Prepare CSV data
    let csvContent = 'data:text/csv;charset=utf-8,';
    
    // Get headers
    const headers = Array.from(reportTable.querySelectorAll('thead th'))
      .map(th => th.textContent);
    csvContent += headers.join(',') + '\n';
    
    // Get rows
    const rows = reportTable.querySelectorAll('tbody tr');
    rows.forEach(row => {
      const rowData = Array.from(row.querySelectorAll('td'))
        .map(td => `"${td.textContent}"`);
      csvContent += rowData.join(',') + '\n';
    });
    
    // Create download link
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'time_tracker_report.csv');
    document.body.appendChild(link);
    
    // Download file
    link.click();
    
    // Clean up
    document.body.removeChild(link);
  }
  
  // Event Handlers
  
  // User change handler
  function onUserChange() {
    currentUser = userSelect.value;
    loadTimeEntries();
  }
  
  // Apply dates handler
  function onApplyDates() {
    currentDateRange.from = dateFrom.value;
    currentDateRange.to = dateTo.value;
    loadTimeEntries();
  }
  
  // Refresh data handler
  function onRefreshData() {
    loadTimeEntries();
  }
  
  // Toggle data source handler
  async function onToggleDataSource() {
    try {
      showLoading(true);
      
      const result = await window.api.invoke('admin:toggleDataSource', {
        useVps: !isUsingVps
      });
      
      if (result.success) {
        await updateDataSourceStatus();
        await loadTimeEntries();
        
        // Clear screenshots
        screenshotsContainer.innerHTML = '<div class="placeholder-message">Select a time entry to view screenshots</div>';
        currentTimeEntry = null;
      } else {
        showError('Failed to toggle data source: ' + result.error);
      }
      
      showLoading(false);
    } catch (error) {
      console.error('Error toggling data source:', error);
      showError('Failed to toggle data source');
      showLoading(false);
    }
  }
  
  // Refresh from VPS handler
  async function onRefreshFromVps() {
    try {
      if (!isUsingVps) {
        alert('Switch to VPS data source first');
        return;
      }
      
      showLoading(true);
      
      const result = await window.api.invoke('admin:refreshFromVps');
      
      if (result.success) {
        alert('Data refreshed from VPS successfully');
        await updateDataSourceStatus();
        await loadTimeEntries();
      } else {
        showError('Failed to refresh from VPS: ' + result.error);
      }
      
      showLoading(false);
    } catch (error) {
      console.error('Error refreshing from VPS:', error);
      showError('Failed to refresh from VPS');
      showLoading(false);
    }
  }
  
  // Clear cache handler
  async function onClearCache() {
    try {
      if (!isUsingVps) {
        alert('Switch to VPS data source first');
        return;
      }
      
      showLoading(true);
      
      const result = await window.api.invoke('admin:clearScreenshotCache');
      
      if (result.success) {
        alert('Screenshot cache cleared successfully');
      } else {
        showError('Failed to clear cache: ' + result.error);
      }
      
      showLoading(false);
    } catch (error) {
      console.error('Error clearing cache:', error);
      showError('Failed to clear cache');
      showLoading(false);
    }
  }
  
  // Client change handler
  function onClientChange() {
    const clientId = clientFilter.value;
    currentFilters.clientId = clientId;
    
    // Reset project filter when client changes
    currentFilters.projectId = 'all';
    projectFilter.value = 'all';
    
    // Load projects for this client
    loadProjects(clientId);
  }
  
  // Apply filters handler
  function onApplyFilters() {
    currentFilters.clientId = clientFilter.value;
    currentFilters.projectId = projectFilter.value;
    loadTimeEntries();
  }
  
  // Set date preset
  function setDatePreset(preset) {
    const today = new Date();
    let fromDate, toDate;
    
    switch (preset) {
      case 'today':
        fromDate = toDate = formatDateValue(today);
        break;
        
      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        fromDate = toDate = formatDateValue(yesterday);
        break;
        
      case 'thisWeek':
        const thisWeekStart = new Date(today);
        thisWeekStart.setDate(today.getDate() - today.getDay()); // Sunday
        fromDate = formatDateValue(thisWeekStart);
        toDate = formatDateValue(today);
        break;
        
      case 'lastWeek':
        const lastWeekStart = new Date(today);
        lastWeekStart.setDate(today.getDate() - today.getDay() - 7); // Previous Sunday
        const lastWeekEnd = new Date(lastWeekStart);
        lastWeekEnd.setDate(lastWeekStart.getDate() + 6); // Saturday
        fromDate = formatDateValue(lastWeekStart);
        toDate = formatDateValue(lastWeekEnd);
        break;
        
      case 'thisMonth':
        const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        fromDate = formatDateValue(thisMonthStart);
        toDate = formatDateValue(today);
        break;
        
      case 'lastMonth':
        const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
        fromDate = formatDateValue(lastMonthStart);
        toDate = formatDateValue(lastMonthEnd);
        break;
        
      case 'last7Days':
        const last7Start = new Date(today);
        last7Start.setDate(today.getDate() - 6);
        fromDate = formatDateValue(last7Start);
        toDate = formatDateValue(today);
        break;
        
      case 'last30Days':
        const last30Start = new Date(today);
        last30Start.setDate(today.getDate() - 29);
        fromDate = formatDateValue(last30Start);
        toDate = formatDateValue(today);
        break;
    }
    
    // Update date fields
    dateFrom.value = fromDate;
    dateTo.value = toDate;
    
    // Update state
    currentDateRange.from = fromDate;
    currentDateRange.to = toDate;
    
    // Reload data
    loadTimeEntries();
  }

  // Utility Functions
  
  // Format date for display (e.g., Jan 15, 2023)
  function formatDate(date) {
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  }
  
  // Format time for display (e.g., 14:30)
  function formatTime(date) {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: false 
    });
  }
  
  // Format date and time for display (e.g., Jan 15, 2023 14:30)
  function formatDateTime(date) {
    return `${formatDate(date)} ${formatTime(date)}`;
  }
  
  // Format duration in seconds to hours:minutes:seconds
  function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  // Format date for input value (YYYY-MM-DD)
  function formatDateValue(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // Get default from date (30 days ago)
  function getDefaultFromDate() {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return formatDateValue(date);
  }
  
  // Get default to date (today)
  function getDefaultToDate() {
    return formatDateValue(new Date());
  }
  
  // Show/hide loading indicator
  function showLoading(isLoading) {
    if (isLoading) {
      dataSourceLoading.classList.remove('hidden');
    } else {
      dataSourceLoading.classList.add('hidden');
    }
  }
  
  // Show error message
  function showError(message) {
    alert(`Error: ${message}`);
  }
  
  // Capitalize first letter of a string
  function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  }
});