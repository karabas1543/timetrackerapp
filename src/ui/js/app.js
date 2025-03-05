// Time Tracker Application - Main UI Script
// Wait for DOM to load
document.addEventListener('DOMContentLoaded', () => {
    // ------ UI ELEMENTS ------
    const loginSection = document.getElementById('login-section');
    const timerSection = document.getElementById('timer-section');
    const loginButton = document.getElementById('login-button');
    const usernameInput = document.getElementById('username');
    
    const clientSelect = document.getElementById('client-select');
    const projectSelect = document.getElementById('project-select');
    const startButton = document.getElementById('start-button');
    const pauseButton = document.getElementById('pause-button');
    const stopButton = document.getElementById('stop-button');
    const timeDisplay = document.getElementById('time-display');
    const entryNotes = document.getElementById('entry-notes');
    const activityStatus = document.getElementById('activity-status');
    
    // ------ STATE VARIABLES ------
    let timerRunning = false;
    let timerInterval = null;
    let seconds = 0;
    let currentUsername = '';
    let activeTimeEntryId = null;
    let currentUserId = null;
    let idleAlertShown = false;
    let lastSyncTime = Date.now();
    let lastServerTime = Date.now();
    let lastClientTime = Date.now();
    let timeDrift = 0; // Drift between client and server time
    
    // ------ INITIALIZATION ------
    // Ensure buttons start in correct state
    pauseButton.classList.add('hidden');
    stopButton.classList.add('hidden');
    
    // ------ TIMER FUNCTIONS ------
    // Update the timer display with current elapsed time
    function updateTimerDisplay() {
        // Detect if we need to sync with the server
        // When minimized, the time between calls will be much greater than 1 second
        const now = Date.now();
        const timeSinceLastSync = now - lastSyncTime;
        
        // Request time from server every 2 seconds or if it's been more than 3 seconds
        // since our last update (which indicates the app was backgrounded)
        if (timeSinceLastSync > 2000) {
            // Request current time from backend
            window.api.send('timer:getCurrentTime', { username: currentUsername });
            lastSyncTime = now;
        } else {
            // For smoother UI, calculate the elapsed time locally
            // considering the app might have been in the background
            const delta = now - lastClientTime;
            lastClientTime = now;
            
            // Only increment if timer is running
            if (timerRunning) {
                // Use the time difference to increment the seconds counter
                // This helps account for throttling when the app is in the background
                seconds += delta / 1000;
            }
        }
        
        // Format and display time using whole seconds only (truncate decimal portion)
        const displaySeconds = Math.floor(seconds);
        const hours = Math.floor(displaySeconds / 3600).toString().padStart(2, '0');
        const minutes = Math.floor((displaySeconds % 3600) / 60).toString().padStart(2, '0');
        const secs = (displaySeconds % 60).toString().padStart(2, '0');
        timeDisplay.textContent = `${hours}:${minutes}:${secs}`;
    }
    
    // Reset the timer to 00:00:00
    function resetTimer() {
        seconds = 0;
        timeDisplay.textContent = '00:00:00';
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }
    
    // Format seconds into HH:MM:SS string
    function formatTime(totalSeconds) {
        const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
        const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
        const secs = (totalSeconds % 60).toString().padStart(2, '0');
        return `${hours}:${minutes}:${secs}`;
    }
    
    // ------ CLIENT/PROJECT DATA FUNCTIONS ------
    // Load clients from the database
    async function loadClients() {
        try {
            // Clear current options
            clientSelect.innerHTML = '<option value="">Select a client</option>';
            
            // Get clients from backend
            const clients = await window.api.invoke('client:getAll');
            
            // Add client options
            clients.forEach(client => {
                const option = document.createElement('option');
                option.value = client.id;
                option.textContent = client.name;
                clientSelect.appendChild(option);
            });
            
            console.log('Clients loaded:', clients.length);
        } catch (error) {
            console.error('Error loading clients:', error);
        }
    }
    
    // Load projects for a specific client
    async function loadProjects(clientId) {
        try {
            // Clear current options
            projectSelect.innerHTML = '<option value="">Select a project</option>';
            
            if (!clientId) return;
            
            // Get projects from backend
            const projects = await window.api.invoke('project:getByClient', { clientId });
            
            // Add project options
            projects.forEach(project => {
                const option = document.createElement('option');
                option.value = project.id;
                option.textContent = project.name;
                projectSelect.appendChild(option);
            });
            
            console.log(`Projects loaded for client ${clientId}:`, projects.length);
        } catch (error) {
            console.error('Error loading projects:', error);
        }
    }
    
    // ------ UI UPDATE FUNCTIONS ------
    // Update the activity status UI
    function updateActivityStatusUI(status) {
        activityStatus.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        
        // Update class for styling
        activityStatus.className = '';
        activityStatus.classList.add(`status-${status}`);
    }
    
    // ------ EVENT LISTENERS ------
    // Login button click
    loginButton.addEventListener('click', () => {
        const username = usernameInput.value.trim();
        if (username) {
            // Store username for later use
            currentUsername = username;
            
            // Send login info to main process
            window.api.send('login', { username });
            
            // Check timer status to see if there's an active timer
            window.api.send('timer:status', { username });
            
            // Switch to the timer section
            loginSection.classList.add('hidden');
            timerSection.classList.remove('hidden');
            
            // Load clients
            loadClients();
        } else {
            alert('Please enter your name');
        }
    });
    
    // Client selection change
    clientSelect.addEventListener('change', () => {
        const clientId = clientSelect.value;
        
        // Load projects for the selected client
        loadProjects(clientId);
    });
    
    // Start/resume button click
    startButton.addEventListener('click', () => {
        if (activeTimeEntryId && !timerRunning) {
            // There's a paused timer, resume it
            window.api.send('timer:resume', { username: currentUsername });
            console.log('Resuming timer...');
        } else if (!timerRunning) {
            // No active timer, start a new one
            const clientId = clientSelect.value;
            const projectId = projectSelect.value;
            
            if (!clientId || !projectId) {
                alert('Please select a client and project before starting the timer');
                return;
            }
            
            // Send start timer command to main process
            window.api.send('timer:start', { 
                username: currentUsername, 
                clientId, 
                projectId,
                isBillable: true 
            });
            console.log('Starting new timer...');
        }
    });
    
    // Pause button click
    pauseButton.addEventListener('click', () => {
        if (timerRunning) {
            // Send pause timer command to main process
            window.api.send('timer:pause', { username: currentUsername });
        } else {
            // Timer is already paused, so resume it
            window.api.send('timer:resume', { username: currentUsername });
        }
    });
    
    // Stop button click
    stopButton.addEventListener('click', () => {
        if (timerRunning || activeTimeEntryId) {
            // Add any notes to the time entry before stopping
            if (entryNotes.value.trim()) {
                window.api.send('timer:addNotes', { 
                    username: currentUsername, 
                    notes: entryNotes.value.trim() 
                });
            }
            
            // Send stop timer command to main process
            window.api.send('timer:stop', { username: currentUsername });
            
            // Clear notes
            entryNotes.value = '';
        }
    });
    
    // Save notes when they change (debounced)
    let notesTimeout = null;
    entryNotes.addEventListener('input', () => {
        if (activeTimeEntryId) {
            // Clear previous timeout
            if (notesTimeout) {
                clearTimeout(notesTimeout);
            }
            
            // Set new timeout to save notes after 1 second of no typing
            notesTimeout = setTimeout(() => {
                window.api.send('timer:addNotes', { 
                    username: currentUsername, 
                    notes: entryNotes.value.trim() 
                });
            }, 1000);
        }
    });
    
    // ------ IPC EVENT LISTENERS ------
    // Listen for current time updates from the main process
    window.api.receive('timer:currentTime', (data) => {
        if (data.elapsed !== undefined) {
            // Set the accurate time from the server
            seconds = data.elapsed;
            
            // Calculate time drift for future corrections
            if (data.serverTime) {
                const clientTime = Date.now();
                lastServerTime = data.serverTime;
                lastClientTime = clientTime;
                
                // Update timing vars for smoother updates
                lastSyncTime = clientTime;
            }
            
            // Update display immediately
            const formattedTime = formatTime(seconds);
            timeDisplay.textContent = formattedTime;
        }
    });
    
    // Listen for timer updates from the main process
    window.api.receive('timer:update', (data) => {
        console.log('Timer update received:', data);
        
        switch (data.action) {
            case 'started':
                timerRunning = true;
                activeTimeEntryId = data.timeEntryId;
                currentUserId = data.userId;
                
                // Start the timer display
                resetTimer();
                if (!timerInterval) {
                    timerInterval = setInterval(updateTimerDisplay, 200); // More frequent updates for smoother display
                }
                
                // Initialize timing variables
                lastSyncTime = Date.now();
                lastClientTime = Date.now();
                if (data.serverTime) {
                    lastServerTime = data.serverTime;
                }
                
                // Update UI - hide Start, show Pause and Stop
                startButton.classList.add('hidden');
                pauseButton.classList.remove('hidden');
                pauseButton.textContent = 'Pause';
                pauseButton.disabled = false;
                stopButton.classList.remove('hidden');
                stopButton.disabled = false;
                
                // Disable client and project selection while timer is running
                clientSelect.disabled = true;
                projectSelect.disabled = true;
                
                // Start activity tracking
                if (window.activityTrackerUI) {
                    window.activityTrackerUI.startTracking(currentUserId);
                    updateActivityStatusUI('active');
                }
                idleAlertShown = false;
                
                // Immediately get the current time for display
                window.api.send('timer:getCurrentTime', { username: currentUsername });
                break;
                
            case 'paused':
                timerRunning = false;
                
                // We keep the timer interval but stop incrementing in updateTimerDisplay
                
                // Update UI - show Resume instead of Pause
                pauseButton.textContent = 'Resume';
                pauseButton.classList.remove('hidden');
                pauseButton.disabled = false;
                stopButton.classList.remove('hidden');
                stopButton.disabled = false;
                startButton.classList.add('hidden');
                
                // Immediately get the current time for display
                window.api.send('timer:getCurrentTime', { username: currentUsername });
                break;
                
            case 'resumed':
                timerRunning = true;
                
                // Reset timing variables for smoother counting
                lastSyncTime = Date.now();
                lastClientTime = Date.now();
                
                // Make sure timer display is running
                if (!timerInterval) {
                    timerInterval = setInterval(updateTimerDisplay, 200);
                }
                
                // Update UI - show Pause again
                pauseButton.textContent = 'Pause';
                pauseButton.classList.remove('hidden');
                pauseButton.disabled = false;
                stopButton.classList.remove('hidden');
                stopButton.disabled = false;
                startButton.classList.add('hidden');
                idleAlertShown = false;
                
                // Immediately get the current time for display
                window.api.send('timer:getCurrentTime', { username: currentUsername });
                break;
                
            case 'stopped':
                timerRunning = false;
                activeTimeEntryId = null;
                
                // Reset the timer display
                resetTimer();
                
                // Update UI - show Start, hide Pause and Stop
                startButton.classList.remove('hidden');
                startButton.disabled = false;
                pauseButton.textContent = 'Pause';
                pauseButton.classList.add('hidden');
                pauseButton.disabled = true;
                stopButton.classList.add('hidden');
                stopButton.disabled = true;
                
                // Enable client and project selection
                clientSelect.disabled = false;
                projectSelect.disabled = false;
                
                // Stop activity tracking
                if (window.activityTrackerUI) {
                    window.activityTrackerUI.stopTracking();
                    updateActivityStatusUI('inactive');
                }
                idleAlertShown = false;
                break;
                
            case 'status':
                // Handle timer status update (usually in response to timer:status request)
                if (data.isActive) {
                    timerRunning = true;
                    activeTimeEntryId = data.timeEntryId;
                    currentUserId = data.userId;
                    
                    // Set up timing variables
                    lastSyncTime = Date.now();
                    lastClientTime = Date.now();
                    
                    // Start the timer display with a placeholder value
                    // We'll update it when we get the current time
                    timeDisplay.textContent = '00:00:00';
                    if (!timerInterval) {
                        timerInterval = setInterval(updateTimerDisplay, 200);
                    }
                    
                    // Request accurate time immediately
                    window.api.send('timer:getCurrentTime', { username: currentUsername });
                    
                    // Update UI - hide Start, show Pause and Stop
                    startButton.classList.add('hidden');
                    pauseButton.classList.remove('hidden');
                    pauseButton.disabled = false;
                    stopButton.classList.remove('hidden');
                    stopButton.disabled = false;
                    
                    // Set client and project selection
                    clientSelect.value = data.clientId;
                    clientSelect.dispatchEvent(new Event('change'));
                    
                    // Need to wait for projects to load before selecting
                    setTimeout(() => {
                        if (projectSelect.querySelector(`option[value="${data.projectId}"]`)) {
                            projectSelect.value = data.projectId;
                        }
                    }, 500);
                    
                    // Disable selection while timer is running
                    clientSelect.disabled = true;
                    projectSelect.disabled = true;
                    
                    // Start activity tracking
                    if (window.activityTrackerUI) {
                        window.activityTrackerUI.startTracking(data.userId);
                        updateActivityStatusUI('active');
                    }
                } else {
                    currentUserId = data.userId;
                    
                    // Ensure buttons are in correct state when no timer is active
                    startButton.classList.remove('hidden');
                    startButton.disabled = false;
                    pauseButton.classList.add('hidden');
                    pauseButton.disabled = true;
                    stopButton.classList.add('hidden');
                    stopButton.disabled = true;
                }
                break;
                
            case 'idleDiscarded':
                // Handle when idle time is discarded
                // The backend has already handled pausing the timer at the idle start time
                timerRunning = false;
                
                // Update UI to reflect paused state
                pauseButton.textContent = 'Resume';
                pauseButton.classList.remove('hidden');
                pauseButton.disabled = false;
                stopButton.classList.remove('hidden');
                stopButton.disabled = false;
                startButton.classList.add('hidden');
                
                // Immediately request the current time to update the display accurately
                window.api.send('timer:getCurrentTime', { username: currentUsername });
                break;
        }
    });
    
    // Listen for timer errors
    window.api.receive('timer:error', (data) => {
        console.error('Timer error:', data);
        alert(`Error: ${data.error}`);
    });
    
    // Listen for idle detection
    window.api.receive('idle:detected', (data) => {
        const idleTime = data.idleTime;
        const minutes = Math.floor(idleTime / 60);
        
        // Show alert if user has been idle for 5+ minutes and alert hasn't been shown yet
        if (minutes >= 5 && timerRunning && !idleAlertShown) {
            idleAlertShown = true; // Prevent further alerts until reset
            
            const keepTime = confirm(`You've been idle for ${minutes} minutes. Do you want to keep this idle time?\n\n• Click OK to keep tracking this time\n• Click Cancel to discard idle time`);
            
            if (!keepTime) {
                // User chose to discard idle time - pause timer at idle start point
                window.api.send('timer:discardIdle', { 
                    username: currentUsername,
                    idleStartTime: Date.now() - (idleTime * 1000) // Calculate when idle began
                });
            } else {
                // User wants to keep the idle time - just update the activity status
                // No action needed, timer keeps running
            }
        }
    });
    
    // Listen for screenshot notifications
    window.api.receive('screenshot:taken', () => {
        // Show a brief notification that a screenshot was taken
        const notification = document.createElement('div');
        notification.className = 'screenshot-notification';
        notification.textContent = 'Screenshot taken';
        document.body.appendChild(notification);
        
        // Remove the notification after 2 seconds
        setTimeout(() => {
            notification.remove();
        }, 2000);
    });
    
    // Listen for activity status changes
    window.api.receive('activity:statusChange', (data) => {
        if (data.userId === currentUserId) {
            updateActivityStatusUI(data.status);
        }
    });
});