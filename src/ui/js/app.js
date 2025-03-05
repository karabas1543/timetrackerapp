// Wait for DOM to load
document.addEventListener('DOMContentLoaded', () => {
    // Get UI elements
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
    
    let timerRunning = false;
    let timerInterval = null;
    let seconds = 0;
    let currentUsername = '';
    let activeTimeEntryId = null;
    let currentUserId = null;
    let idleAlertShown = false;
    
    // Ensure buttons start in correct state
    pauseButton.classList.add('hidden');
    stopButton.classList.add('hidden');
    
    // Load clients when the app starts
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
    
    // Login functionality
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
    
    // Timer functionality
    function updateTimerDisplay() {
        seconds++;
        const hours = Math.floor(seconds / 3600).toString().padStart(2, '0');
        const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        timeDisplay.textContent = `${hours}:${minutes}:${secs}`;
    }
    
    function resetTimer() {
        seconds = 0;
        timeDisplay.textContent = '00:00:00';
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }
    
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
    
    pauseButton.addEventListener('click', () => {
        if (timerRunning) {
            // Send pause timer command to main process
            window.api.send('timer:pause', { username: currentUsername });
        } else {
            // Timer is already paused, so resume it
            window.api.send('timer:resume', { username: currentUsername });
        }
    });
    
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
    
    // Activity status updates
    function updateActivityStatusUI(status) {
        activityStatus.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        
        // Update class for styling
        activityStatus.className = '';
        activityStatus.classList.add(`status-${status}`);
    }
    
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
                timerInterval = setInterval(updateTimerDisplay, 1000);
                
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
                break;
                
            case 'paused':
                timerRunning = false;
                
                // Stop the timer display
                if (timerInterval) {
                    clearInterval(timerInterval);
                    timerInterval = null;
                }
                
                // Update UI - show Resume instead of Pause
                pauseButton.textContent = 'Resume';
                pauseButton.classList.remove('hidden');
                pauseButton.disabled = false;
                stopButton.classList.remove('hidden');
                stopButton.disabled = false;
                startButton.classList.add('hidden');
                break;
                
            case 'resumed':
                timerRunning = true;
                
                // Resume the timer display
                timerInterval = setInterval(updateTimerDisplay, 1000);
                
                // Update UI - show Pause again
                pauseButton.textContent = 'Pause';
                pauseButton.classList.remove('hidden');
                pauseButton.disabled = false;
                stopButton.classList.remove('hidden');
                stopButton.disabled = false;
                startButton.classList.add('hidden');
                idleAlertShown = false;
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
                    
                    // Calculate seconds elapsed
                    const startTime = new Date(data.startTime).getTime();
                    const now = Date.now();
                    seconds = Math.floor((now - startTime) / 1000);
                    
                    // Start the timer display
                    timeDisplay.textContent = formatTime(seconds);
                    timerInterval = setInterval(updateTimerDisplay, 1000);
                    
                    // Update UI - hide Start, show Pause and Stop
                    startButton.classList.add('hidden');
                    pauseButton.classList.remove('hidden');
                    pauseButton.disabled = false;
                    stopButton.classList.remove('hidden');
                    stopButton.disabled = false;
                    
                    // Set client and project selection
                    clientSelect.value = data.clientId;
                    clientSelect.dispatchEvent(new Event('change'));
                    projectSelect.value = data.projectId;
                    
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
                    timerRunning = false; // Add this line
                    pauseButton.textContent = 'Resume';
                    pauseButton.classList.remove('hidden');
                    pauseButton.disabled = false;
                    stopButton.classList.remove('hidden');
                    stopButton.disabled = false;
                    startButton.classList.add('hidden');
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
    
    // Helper function to format time
    function formatTime(totalSeconds) {
        const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
        const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
        const seconds = (totalSeconds % 60).toString().padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }
});