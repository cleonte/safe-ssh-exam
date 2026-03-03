import { app, BrowserWindow, globalShortcut, dialog, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { ExamConfig } from './types';

let mainWindow: BrowserWindow | null = null;
let config: ExamConfig;
let sessionStartTime: number;
let timerInterval: NodeJS.Timeout | null = null;
let devMode = false;
let allowQuit = false;  // Flag to allow quitting after password verification

// Check for dev mode flag
function checkDevMode() {
  devMode = process.argv.includes('--dev') || config?.devMode === true;
  if (devMode) {
    console.log('Dev mode enabled - shortcuts and kiosk mode disabled');
  }
}

// Load configuration
function loadConfig() {
  const configPath = path.join(__dirname, '../exam-config.json');
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    // Check dev mode from config or command line
    checkDevMode();
    
    // Create session recording directory if needed
    if (config.recordSession && config.sessionRecordingPath) {
      const recordingPath = path.resolve(config.sessionRecordingPath);
      if (!fs.existsSync(recordingPath)) {
        fs.mkdirSync(recordingPath, { recursive: true });
      }
    }
  } catch (error) {
    console.error('Failed to load config:', error);
    dialog.showErrorBox('Configuration Error', 'Failed to load exam-config.json');
    app.quit();
  }
}

// Block all system shortcuts
function blockSystemShortcuts() {
  // Skip blocking shortcuts in dev mode
  if (devMode) {
    console.log('Dev mode: shortcuts not blocked');
    return;
  }
  
  const shortcuts = [
    // Note: CommandOrControl+Q is NOT blocked here because we handle it separately with password protection
    'CommandOrControl+W',     // Close window
    'CommandOrControl+N',     // New window
    'CommandOrControl+T',     // New tab
    'CommandOrControl+H',     // Hide
    'CommandOrControl+M',     // Minimize
    'CommandOrControl+Tab',   // Switch apps
    'Alt+Tab',                // Switch apps (Windows/Linux)
    'Alt+F4',                 // Close (Windows/Linux)
    'F11',                    // Fullscreen toggle
    'Command+M',              // Minimize (macOS)
    'Command+H',              // Hide (macOS)
    'Command+Option+Esc',     // Force quit (macOS)
    'Control+Alt+Delete',     // Task manager (Windows)
  ];

  // Optionally allow/block copy-paste
  if (!config.allowCopyPaste) {
    shortcuts.push('CommandOrControl+C');
    shortcuts.push('CommandOrControl+V');
    shortcuts.push('CommandOrControl+X');
  }

  shortcuts.forEach(shortcut => {
    globalShortcut.register(shortcut, () => {
      console.log(`Blocked shortcut: ${shortcut}`);
      // Do nothing - effectively blocking the shortcut
    });
  });
}

// Unblock all shortcuts
function unblockShortcuts() {
  globalShortcut.unregisterAll();
}

// Check remaining time and show warnings
function checkTimeRemaining() {
  const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
  const remaining = config.sessionDuration - elapsed;

  if (remaining <= 0) {
    endSession('Time limit reached');
    return;
  }

  // Show warnings
  if (config.warnings['5min'] && remaining === 300) {
    showWarning('5 minutes remaining in exam session');
  } else if (config.warnings['1min'] && remaining === 60) {
    showWarning('1 minute remaining in exam session');
  }

  // Send time update to renderer
  if (mainWindow) {
    mainWindow.webContents.send('time-update', remaining);
  }
}

// Show warning dialog
function showWarning(message: string): void {
  if (mainWindow) {
    mainWindow.webContents.send('show-warning', message);
  }
}

// End the exam session
function endSession(reason: string): void {
  console.log('Session ended:', reason);
  
  if (timerInterval) {
    clearInterval(timerInterval);
  }
  
  if (mainWindow) {
    mainWindow.webContents.send('session-ended', reason);
  }
  
  // Show final message
  setTimeout(() => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Session Ended',
      message: config.exitMessage || 'Exam session has ended.',
      buttons: ['Exit']
    }).then(() => {
      unblockShortcuts();
      app.quit();
    });
  }, 1000);
}

function createWindow() {
  loadConfig();

  mainWindow = new BrowserWindow({
    fullscreen: !devMode,
    kiosk: !devMode,  // Kiosk mode prevents app switching
    frame: devMode,  // Show frame in dev mode
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,  // Enable require() in renderer
      contextIsolation: false,  // Disable context isolation to allow require in renderer
      devTools: devMode  // Enable dev tools in dev mode
    }
  });

  // Prevent window from being closed or minimized (skip in dev mode)
  mainWindow.on('close', (e: Electron.Event) => {
    // Allow quit if password was verified or in dev mode
    if (allowQuit || devMode) {
      return;
    }
    
    if (config.requirePassword && config.adminPassword) {
      e.preventDefault();
      
      if (mainWindow) {
        mainWindow.webContents.send('request-admin-password');
      }
    }
  });

  // Prevent leaving fullscreen (skip in dev mode)
  mainWindow.on('leave-full-screen', (e: Electron.Event) => {
    if (!devMode) {
      e.preventDefault();
      if (mainWindow) {
        mainWindow.setFullScreen(true);
      }
    }
  });

  // Block all system shortcuts
  blockSystemShortcuts();

  // Register exit shortcuts (requires admin password in production mode)
  // F12 - Traditional exit shortcut
  globalShortcut.register('F12', () => {
    if (mainWindow && config.requirePassword && config.adminPassword) {
      mainWindow.webContents.send('request-admin-password');
    }
  });
  
  // Cmd+Q (macOS) / Ctrl+Q (Windows/Linux) - Quit shortcut
  const quitShortcut = process.platform === 'darwin' ? 'Command+Q' : 'Ctrl+Q';
  globalShortcut.register(quitShortcut, () => {
    if (mainWindow) {
      if (devMode) {
        // In dev mode, quit immediately
        app.quit();
      } else if (config.requirePassword && config.adminPassword) {
        // In production mode, require admin password
        mainWindow.webContents.send('request-admin-password');
      }
    }
  });

  // Start session timer
  sessionStartTime = Date.now();
  timerInterval = setInterval(checkTimeRemaining, 1000);

  mainWindow.loadFile(path.join(__dirname, '../src/index.html'));
  
  // Send config to renderer after page loads
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Sending config to renderer:', config);
    if (mainWindow) {
      mainWindow.webContents.send('config-data', config);
    }
  });

  // Prevent any navigation
  mainWindow.webContents.on('will-navigate', (e: Electron.Event) => {
    e.preventDefault();
  });

  // Note: 'new-window' event is deprecated in newer Electron versions
  // Use 'window-open' handler in webContents.setWindowOpenHandler instead
}

// Handle admin password verification
ipcMain.on('verify-admin-password', (event: Electron.IpcMainEvent, password: string) => {
  if (password === config.adminPassword) {
    console.log('Admin password verified, allowing quit');
    allowQuit = true;  // Set flag to allow quit
    unblockShortcuts();
    if (timerInterval) {
      clearInterval(timerInterval);
    }
    app.quit();
  } else {
    console.log('Incorrect admin password');
    event.reply('password-incorrect');
  }
});

// Send config to renderer
ipcMain.on('get-config', (event: Electron.IpcMainEvent) => {
  event.reply('config-data', config);
});

// Handle session recording
ipcMain.on('record-data', (_event: Electron.IpcMainEvent, data: { tabId?: number; message: string }) => {
  if (config.recordSession) {
    const timestamp = new Date().toISOString();
    const sessionId = sessionStartTime;
    const tabId = data.tabId || 'main';
    const message = data.message || data;
    
    const logPath = path.join(
      config.sessionRecordingPath,
      `session-${sessionId}-tab-${tabId}.log`
    );
    
    const logEntry = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(logPath, logEntry);
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  unblockShortcuts();
  app.quit();
});

app.on('will-quit', () => {
  unblockShortcuts();
  if (timerInterval) {
    clearInterval(timerInterval);
  }
});

// Prevent app from being hidden (skip in dev mode)
app.on('browser-window-blur', () => {
  if (mainWindow && !devMode) {
    mainWindow.focus();
  }
});
