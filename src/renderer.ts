import { Client } from 'ssh2';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { ExamConfig, ConnectionInfo, Tab } from './types';

let config: ExamConfig;
let tabs: Tab[] = [];           // Array of tab objects
let activeTabId: number | null = null;  // Currently active tab ID
let nextTabId = 1;       // Auto-increment tab IDs
let connectionInfo: ConnectionInfo | null = null; // Store {hostIndex, username, password, hostInfo}
let resizeTimeout: NodeJS.Timeout | null = null; // Debounce resize events

// Helper functions for type-safe DOM access
function getElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Element with id '${id}' not found`);
  return element as T;
}

function getSelectElement(id: string): HTMLSelectElement {
  return getElement<HTMLSelectElement>(id);
}

function getInputElement(id: string): HTMLInputElement {
  return getElement<HTMLInputElement>(id);
}

function getButtonElement(id: string): HTMLButtonElement {
  return getElement<HTMLButtonElement>(id);
}


// Wait for config to be loaded
function waitForConfig(): Promise<ExamConfig> {
  console.log('waitForConfig called, window.examConfig:', window.examConfig);
  return new Promise((resolve) => {
    if (window.examConfig) {
      console.log('Config already available:', window.examConfig);
      resolve(window.examConfig);
    } else {
      console.log('Waiting for config...');
      const interval = setInterval(() => {
        console.log('Checking for config, window.examConfig:', window.examConfig);
        if (window.examConfig) {
          clearInterval(interval);
          console.log('Config received:', window.examConfig);
          resolve(window.examConfig);
        }
      }, 100);
    }
  });
}

// Initialize the application
async function init(): Promise<void> {
  console.log('Init called');
  config = await waitForConfig();
  console.log('Config loaded in init:', config);
  
  // Populate host selection
  populateHostSelection();
  
  // Setup event listeners
  setupEventListeners();
  
  // Setup time update handler
  window.examAPI.onTimeUpdate((remaining) => {
    updateTimer(remaining);
  });
  
  // Setup warning handler
  window.examAPI.onShowWarning((message) => {
    showWarning(message);
  });
  
  // Setup session ended handler
  window.examAPI.onSessionEnded((reason) => {
    handleSessionEnd(reason);
  });
  
  // Setup admin password handlers
  window.examAPI.onRequestAdminPassword(() => {
    showAdminDialog();
  });
  
  window.examAPI.onPasswordIncorrect(() => {
    showAdminError();
  });
  
  // Prevent context menu
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });
  
  // Disable copy/paste if configured
  if (!config.allowCopyPaste) {
    document.addEventListener('copy', (e) => e.preventDefault());
    document.addEventListener('paste', (e) => e.preventDefault());
    document.addEventListener('cut', (e) => e.preventDefault());
  }
  
  // Setup keyboard shortcuts
  setupKeyboardShortcuts();
}

// Populate host selection dropdown
function populateHostSelection(): void {
  const select = getSelectElement('host-select');
  
  // Debug: log config
  console.log('populateHostSelection called');
  console.log('Config:', config);
  console.log('Allowed hosts:', config?.allowedHosts);
  
  if (!config) {
    console.error('Config is null or undefined!');
    alert('ERROR: Config is not loaded!');
    return;
  }
  
  if (!config.allowedHosts) {
    console.error('Config.allowedHosts is undefined!');
    alert('ERROR: Config.allowedHosts is undefined!');
    return;
  }
  
  if (!Array.isArray(config.allowedHosts)) {
    console.error('Config.allowedHosts is not an array!');
    alert('ERROR: Config.allowedHosts is not an array!');
    return;
  }
  
  if (config.allowedHosts.length === 0) {
    console.warn('Config.allowedHosts is empty!');
    alert('WARNING: No allowed hosts configured!');
    return;
  }
  
  // Clear existing options except the first one
  while (select.options.length > 1) {
    select.remove(1);
  }
  
  config.allowedHosts.forEach((hostInfo, index) => {
    console.log(`Adding host ${index}:`, hostInfo);
    const option = document.createElement('option');
    option.value = index.toString();
    option.textContent = `${hostInfo.host}:${hostInfo.port} - ${hostInfo.description}`;
    select.appendChild(option);
    console.log('Option added to select');
  });
  
  console.log(`Successfully populated ${config.allowedHosts.length} hosts`);
  console.log('Select element now has', select.options.length, 'options');
}

// Setup event listeners
function setupEventListeners(): void {
  getElement('connect-btn').addEventListener('click', handleConnect);
  getElement('new-tab-btn').addEventListener('click', handleNewTab);
  getElement('admin-submit').addEventListener('click', handleAdminSubmit);
  getElement('admin-cancel').addEventListener('click', hideAdminDialog);
  getElement('admin-exit-btn').addEventListener('click', handleAdminExitClick);
  
  // Allow Enter key to connect
  getElement('password').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleConnect();
    }
  });
  
  // Allow Enter key for admin password
  getInputElement('admin-password').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleAdminSubmit();
    }
  });
  
  // Handle window resize - debounced to avoid excessive calls
  window.addEventListener('resize', () => {
    // Clear any pending resize timeout
    if (resizeTimeout) {
      clearTimeout(resizeTimeout);
    }
    
    // Debounce resize events to avoid performance issues
    resizeTimeout = setTimeout(() => {
      resizeActiveTerminal();
      resizeTimeout = null;
    }, 100);
  });
}

// Resize the active terminal
function resizeActiveTerminal(): void {
  const activeTab = getActiveTab();
  if (activeTab && activeTab.fitAddon) {
    try {
      activeTab.fitAddon.fit();
      console.log(`Terminal resized: ${activeTab.terminal.cols}x${activeTab.terminal.rows}`);
      
      // Update SSH window size if connected
      if (activeTab.sshStream) {
        activeTab.sshStream.setWindow(
          activeTab.terminal.rows,
          activeTab.terminal.cols,
          activeTab.terminal.rows * 16,  // height in pixels (approximate)
          activeTab.terminal.cols * 8    // width in pixels (approximate)
        );
      }
    } catch (error) {
      console.error('Error resizing terminal:', error);
    }
  }
}

// Setup keyboard shortcuts
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // F12 for admin exit
    if (e.key === 'F12') {
      e.preventDefault();
      if (config.requirePassword && config.adminPassword) {
        showAdminDialog();
      }
      return;
    }
    
    // Cmd+Q (macOS) or Ctrl+Q (Windows/Linux) for admin exit
    if ((e.metaKey || e.ctrlKey) && e.key === 'q') {
      e.preventDefault();
      if (config.requirePassword && config.adminPassword) {
        showAdminDialog();
      }
      return;
    }
    
    // Ctrl+T for new tab
    if (e.ctrlKey && e.key === 't') {
      e.preventDefault();
      handleNewTab();
      return;
    }
    
    // Ctrl+1 or Ctrl+2 for tab switching
    if (e.ctrlKey && e.key >= '1' && e.key <= '2') {
      e.preventDefault();
      const tabIndex = parseInt(e.key) - 1;
      if (tabs[tabIndex]) {
        switchTab(tabs[tabIndex].id);
      }
    }
  });
}

// Handle initial connection
function handleConnect(): void {
  const hostIndex = getSelectElement('host-select').value;
  const username = getInputElement('username').value;
  const password = getInputElement('password').value;
  
  if (hostIndex === '' || !username || !password) {
    showError('Please fill in all fields');
    return;
  }
  
  const hostInfo = config.allowedHosts[parseInt(hostIndex)];
  
  // Store connection info for future tabs
  connectionInfo = {
    hostIndex: parseInt(hostIndex),
    username: username,
    password: password,
    hostInfo: hostInfo
  };
  
  // Clear any previous errors
  document.getElementById('connection-error').classList.add('hidden');
  
  // Hide connection panel and show tab bar + terminals area
  document.getElementById('connection-panel').classList.add('hidden');
  document.getElementById('tab-bar').classList.remove('hidden');
  document.getElementById('terminals-area').classList.remove('hidden');
  
  // Create first tab
  createTab(true);
}

// Create a new tab
function createTab(isFirstTab = false) {
  if (!connectionInfo) {
    showError('No connection information available');
    return;
  }
  
  // Check tab limit
  if (tabs.length >= config.maxTabs) {
    showWarning(`Maximum ${config.maxTabs} tabs allowed`);
    return;
  }
  
  const tabId = nextTabId++;
  const { username, password, hostInfo } = connectionInfo;
  
  // Create terminal instance with xterm
  const terminal = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    theme: {
      background: '#1e1e1e',
      foreground: '#d4d4d4'
    },
    scrollback: 10000
  });
  
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  
  // Create container for this terminal
  const containerElement = document.createElement('div');
  containerElement.className = 'terminal-tab-container';
  containerElement.id = `terminal-tab-${tabId}`;
  document.getElementById('terminals-area').appendChild(containerElement);
  
  // Open terminal in container
  terminal.open(containerElement);
  
  // Fit terminal to container after a small delay to ensure proper layout
  // Use longer delay and multiple retries to ensure container is fully rendered
  setTimeout(() => {
    try {
      fitAddon.fit();
      console.log(`Terminal ${tabId} fitted: ${terminal.cols}x${terminal.rows}`);
    } catch (error) {
      console.error('Error fitting terminal on creation:', error);
    }
  }, 50);
  
  // Additional fit after a longer delay to catch late layout changes
  setTimeout(() => {
    try {
      fitAddon.fit();
      console.log(`Terminal ${tabId} re-fitted: ${terminal.cols}x${terminal.rows}`);
    } catch (error) {
      console.error('Error re-fitting terminal:', error);
    }
  }, 200);
  
  // Create tab object
  const tab = {
    id: tabId,
    terminal: terminal,
    sshClient: null,
    sshStream: null,
    fitAddon: fitAddon,
    sessionBuffer: '',
    label: `${username}@${hostInfo.host} (${tabId})`,
    containerElement: containerElement
  };
  
  // Handle terminal data (user input)
  terminal.onData((data) => {
    if (tab.sshStream) {
      tab.sshStream.write(data);
      
      // Record session data
      if (config.recordSession) {
        window.examAPI.recordData({
          tabId: tabId,
          message: `INPUT: ${data}`
        });
      }
    }
  });
  
  // Add to tabs array
  tabs.push(tab);
  
  // Create tab UI element
  createTabElement(tab);
  
  // Switch to this tab
  switchTab(tabId);
  
  // Connect to SSH
  connectTabSSH(tab, isFirstTab);
  
  // Update new tab button state
  updateNewTabButton();
}

// Create tab UI element
function createTabElement(tab) {
  const tabsContainer = document.getElementById('tabs-container');
  
  const tabElement = document.createElement('div');
  tabElement.className = 'tab';
  tabElement.dataset.tabId = tab.id;
  
  const labelElement = document.createElement('span');
  labelElement.className = 'tab-label';
  labelElement.textContent = tab.label;
  
  const closeButton = document.createElement('button');
  closeButton.className = 'tab-close';
  closeButton.textContent = '×';
  closeButton.title = 'Close tab';
  
  // Click on tab to switch
  tabElement.addEventListener('click', (e) => {
    if (e.target !== closeButton) {
      switchTab(tab.id);
    }
  });
  
  // Click on close button
  closeButton.addEventListener('click', (e) => {
    e.stopPropagation();
    handleCloseTab(tab.id);
  });
  
  tabElement.appendChild(labelElement);
  tabElement.appendChild(closeButton);
  tabsContainer.appendChild(tabElement);
}

// Connect tab to SSH
function connectTabSSH(tab, isFirstTab) {
  const { username, password, hostInfo } = connectionInfo;
  
  // Update status
  if (isFirstTab || activeTabId === tab.id) {
    updateStatus('connecting', 'Connecting...');
  }
  
  // Create SSH client
  const sshClient = new Client();
  tab.sshClient = sshClient;
  
  sshClient.on('ready', () => {
    console.log(`Tab ${tab.id}: SSH connection established`);
    
    if (activeTabId === tab.id) {
      updateStatus('connected', `Connected to ${hostInfo.host}`);
    }
    
    // Request shell
    sshClient.shell({
      term: 'xterm-256color',
      rows: tab.terminal.rows,
      cols: tab.terminal.cols
    }, (err, stream) => {
      if (err) {
        tab.terminal.write(`\r\nFailed to start shell: ${err.message}\r\n`);
        if (activeTabId === tab.id) {
          updateStatus('disconnected', 'Connection Failed');
        }
        return;
      }
      
      tab.sshStream = stream;
      
      // Fit terminal after SSH connection is established
      setTimeout(() => {
        try {
          tab.fitAddon.fit();
          console.log(`Tab ${tab.id} fitted after SSH connect: ${tab.terminal.cols}x${tab.terminal.rows}`);
          // Set initial window size
          stream.setWindow(
            tab.terminal.rows,
            tab.terminal.cols,
            tab.terminal.rows * 16,
            tab.terminal.cols * 8
          );
        } catch (error) {
          console.error('Error fitting terminal after SSH connect:', error);
        }
      }, 100);
      
      // Handle stream data (output from server)
      stream.on('data', (data) => {
        tab.terminal.write(data);
        
        // Record session data
        if (config.recordSession) {
          tab.sessionBuffer += data.toString();
          if (tab.sessionBuffer.length > 1000) {
            window.examAPI.recordData({
              tabId: tab.id,
              message: `OUTPUT: ${tab.sessionBuffer}`
            });
            tab.sessionBuffer = '';
          }
        }
      });
      
      stream.on('close', () => {
        console.log(`Tab ${tab.id}: SSH stream closed`);
        tab.terminal.write('\r\n\r\nConnection closed.\r\n');
        
        if (activeTabId === tab.id) {
          updateStatus('disconnected', 'Disconnected');
        }
        
        // Flush any remaining session data
        if (config.recordSession && tab.sessionBuffer.length > 0) {
          window.examAPI.recordData({
            tabId: tab.id,
            message: `OUTPUT: ${tab.sessionBuffer}`
          });
          tab.sessionBuffer = '';
        }
      });
      
      stream.stderr.on('data', (data) => {
        tab.terminal.write(data);
      });
    });
  });
  
  sshClient.on('error', (err) => {
    console.error(`Tab ${tab.id}: SSH error:`, err);
    tab.terminal.write(`\r\nConnection failed: ${err.message}\r\n`);
    
    if (activeTabId === tab.id) {
      updateStatus('disconnected', 'Connection Failed');
    }
  });
  
  sshClient.on('close', () => {
    console.log(`Tab ${tab.id}: SSH connection closed`);
    
    if (activeTabId === tab.id) {
      updateStatus('disconnected', 'Disconnected');
    }
  });
  
  // Connect to SSH server
  sshClient.connect({
    host: hostInfo.host,
    port: hostInfo.port,
    username: username,
    password: password,
    readyTimeout: 20000
  });
  
  // Record connection attempt
  if (config.recordSession) {
    window.examAPI.recordData({
      tabId: tab.id,
      message: `CONNECT: ${username}@${hostInfo.host}:${hostInfo.port}`
    });
  }
}

// Switch to a specific tab
function switchTab(tabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;
  
  // Update active tab ID
  activeTabId = tabId;
  
  // Hide all terminal containers
  tabs.forEach(t => {
    t.containerElement.classList.remove('active');
  });
  
  // Show selected terminal container
  tab.containerElement.classList.add('active');
  
  // Update tab visual state
  document.querySelectorAll('.tab').forEach(tabElement => {
    const elementTabId = parseInt((tabElement as HTMLElement).dataset.tabId || '0');
    if (elementTabId === tabId) {
      tabElement.classList.add('active');
    } else {
      tabElement.classList.remove('active');
    }
  });
  
  // Resize terminal - wait for layout to settle
  if (tab.fitAddon) {
    setTimeout(() => {
      try {
        tab.fitAddon.fit();
        console.log(`Tab ${tabId} switched and fitted: ${tab.terminal.cols}x${tab.terminal.rows}`);
        if (tab.sshStream) {
          tab.sshStream.setWindow(
            tab.terminal.rows,
            tab.terminal.cols,
            480,
            640
          );
        }
      } catch (error) {
        console.error(`Error fitting terminal on tab switch:`, error);
      }
    }, 50);
  }
  
  // Update status based on tab connection state
  if (tab.sshClient && tab.sshStream) {
    updateStatus('connected', `Connected to ${connectionInfo.hostInfo.host}`);
  } else if (tab.sshClient) {
    updateStatus('connecting', 'Connecting...');
  } else {
    updateStatus('disconnected', 'Disconnected');
  }
}

// Handle new tab button click
function handleNewTab() {
  createTab(false);
}

// Handle close tab (with confirmation)
function handleCloseTab(tabId) {
  // Show confirmation dialog
  const confirmClose = confirm('Are you sure you want to close this tab?');
  
  if (!confirmClose) {
    return;
  }
  
  closeTab(tabId);
}

// Close a specific tab
function closeTab(tabId) {
  const tabIndex = tabs.findIndex(t => t.id === tabId);
  if (tabIndex === -1) return;
  
  const tab = tabs[tabIndex];
  
  // Close SSH connection
  if (tab.sshClient) {
    tab.sshClient.end();
  }
  
  // Flush session buffer
  if (config.recordSession && tab.sessionBuffer.length > 0) {
    window.examAPI.recordData({
      tabId: tab.id,
      message: `OUTPUT: ${tab.sessionBuffer}`
    });
  }
  
  // Remove terminal from DOM
  tab.containerElement.remove();
  
  // Remove tab UI element
  const tabElement = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
  if (tabElement) {
    tabElement.remove();
  }
  
  // Remove from tabs array
  tabs.splice(tabIndex, 1);
  
  // If this was the active tab, switch to another
  if (activeTabId === tabId) {
    if (tabs.length > 0) {
      // Switch to the first remaining tab
      switchTab(tabs[0].id);
    } else {
      // No tabs left - return to connection panel
      returnToConnectionPanel();
    }
  }
  
  // Update new tab button state
  updateNewTabButton();
}

// Return to connection panel
function returnToConnectionPanel() {
  // Hide tab bar and terminals area
  document.getElementById('tab-bar').classList.add('hidden');
  document.getElementById('terminals-area').classList.add('hidden');
  
  // Show connection panel
  document.getElementById('connection-panel').classList.remove('hidden');
  
  // Reset connection info
  connectionInfo = null;
  activeTabId = null;
  
  // Clear credentials
  getInputElement('username').value = '';
  getInputElement('password').value = '';
  
  // Reset status
  updateStatus('disconnected', 'Not Connected');
}

// Update new tab button state
function updateNewTabButton(): void {
  const newTabBtn = getButtonElement('new-tab-btn');
  if (tabs.length >= config.maxTabs) {
    newTabBtn.disabled = true;
    newTabBtn.title = `Maximum ${config.maxTabs} tabs reached`;
  } else {
    newTabBtn.disabled = false;
    newTabBtn.title = 'New Tab (Ctrl+T)';
  }
}

// Get active tab
function getActiveTab() {
  return tabs.find(t => t.id === activeTabId);
}

// Update status indicator
function updateStatus(status, text) {
  const indicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');
  
  indicator.className = status;
  statusText.textContent = text;
}

// Show error message
function showError(message) {
  const errorDiv = document.getElementById('connection-error');
  errorDiv.textContent = message;
  errorDiv.classList.remove('hidden');
}

// Update timer display
function updateTimer(remainingSeconds) {
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  
  document.getElementById('time-remaining').textContent = timeString;
  
  // Change color when time is running out
  const timerElement = document.getElementById('timer');
  if (remainingSeconds <= 60) {
    timerElement.style.color = '#ff4444';
  } else if (remainingSeconds <= 300) {
    timerElement.style.color = '#ffaa00';
  }
}

// Show warning overlay
function showWarning(message) {
  const overlay = document.getElementById('warning-overlay');
  const messageDiv = document.getElementById('warning-message');
  
  messageDiv.textContent = message;
  overlay.classList.remove('hidden');
  
  // Hide after 5 seconds
  setTimeout(() => {
    overlay.classList.add('hidden');
  }, 5000);
}

// Handle session end
function handleSessionEnd(reason) {
  console.log('Session ended:', reason);
  
  // Close all SSH connections
  tabs.forEach(tab => {
    if (tab.sshClient) {
      tab.sshClient.end();
    }
    
    // Disable terminal
    if (tab.terminal) {
      tab.terminal.write(`\r\n\r\n=== SESSION ENDED: ${reason} ===\r\n`);
      tab.terminal.options.disableStdin = true;
    }
  });
  
  updateStatus('disconnected', 'Session Ended');
}

// Show admin dialog
function showAdminDialog() {
  document.getElementById('admin-dialog').classList.remove('hidden');
  document.getElementById('admin-password').focus();
}

// Handle admin exit button click
function handleAdminExitClick(): void {
  if (config.requirePassword && config.adminPassword) {
    showAdminDialog();
  }
}

// Hide admin dialog
function hideAdminDialog(): void {
  getElement('admin-dialog').classList.add('hidden');
  getInputElement('admin-password').value = '';
  getElement('admin-error').classList.add('hidden');
}

// Handle admin password submission
function handleAdminSubmit(): void {
  const password = getInputElement('admin-password').value;
  window.examAPI.verifyAdminPassword(password);
}

// Show admin password error
function showAdminError(): void {
  getElement('admin-error').classList.remove('hidden');
  getInputElement('admin-password').value = '';
  getInputElement('admin-password').focus();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
