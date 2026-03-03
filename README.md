# Secure Exam Terminal

A locked-down terminal/SSH client designed for secure exam environments, similar to Safe Exam Browser but for command-line access.

> **Note:** This project was developed with AI assistance using [OpenCode](https://opencode.ai).

## Features

- **Fullscreen Kiosk Mode**: Runs in fullscreen kiosk mode to prevent app switching
- **System Shortcut Blocking**: Prevents Alt+Tab, screenshots, and other system shortcuts
- **Multiple Exit Methods**: 
  - Press F12 or Cmd+Q/Ctrl+Q to exit with admin password
  - Click the red "Exit" button in the header
- **Multiple Tabs**: Support for up to 2 concurrent SSH sessions
- **SSH Host Whitelisting**: Only allows connections to pre-approved exam servers
- **Session Recording**: Logs all terminal input/output for review (separate logs per tab)
- **Time Limits**: Automatic session termination after configured duration
- **Copy/Paste Control**: Can disable clipboard operations
- **Admin Password Protection**: Requires password to exit the application

## Installation

1. Install dependencies:
```bash
npm install
```

## Configuration

1. Copy the example configuration file:
```bash
cp exam-config.example.json exam-config.json
```

2. Edit `exam-config.json` to configure the exam environment:

```json
{
  "allowedHosts": [
    {
      "host": "exam-server.university.edu",
      "port": 22,
      "description": "Main exam server"
    }
  ],
  "sessionDuration": 7200,
  "maxTabs": 2,
  "allowCopyPaste": false,
  "recordSession": true,
  "sessionRecordingPath": "./sessions",
  "requirePassword": true,
  "adminPassword": "your-secure-password-here",
  "exitMessage": "Exam session ended. Please close the application.",
  "warnings": {
    "5min": true,
    "1min": true
  }
}
```

**Important:** Never commit `exam-config.json` to version control as it contains sensitive passwords and server information. Use `exam-config.example.json` as a template.

### Configuration Options

- **allowedHosts**: Array of SSH servers students can connect to
  - `host`: Server hostname or IP address
  - `port`: SSH port (usually 22)
  - `description`: Human-readable description shown to students

- **sessionDuration**: Exam duration in seconds (7200 = 2 hours)

- **maxTabs**: Maximum number of concurrent SSH tabs allowed (default: 2)

- **allowCopyPaste**: Enable/disable clipboard operations (true/false)

- **recordSession**: Enable session logging (true/false)

- **sessionRecordingPath**: Directory where session logs are saved

- **requirePassword**: Require admin password to exit (true/false)

- **adminPassword**: Password required to exit the application (leave empty to disable)

- **exitMessage**: Message shown when session ends

- **warnings**: Show time warnings
  - `5min`: Show warning at 5 minutes remaining
  - `1min`: Show warning at 1 minute remaining

## Usage

### For Administrators

1. Copy the example configuration:
```bash
cp exam-config.example.json exam-config.json
```

2. Configure `exam-config.json` with your exam servers and settings

3. Set a secure admin password:
```json
"adminPassword": "your-secure-password"
```

4. Start the application:
```bash
npm start
```

5. To exit during testing:
   - Press **F12** or **Cmd+Q** (macOS) / **Ctrl+Q** (Windows/Linux)
   - Click the red **"Exit"** button in the header
   - Enter the admin password

### For Students

1. Launch the Secure Exam Terminal application

2. Select the exam server from the dropdown

3. Enter your credentials

4. Click "Connect"

5. **Working with Multiple Tabs**:
   - Click the **+** button or press **Ctrl+T** to open a new tab (up to 2 tabs)
   - Switch between tabs using **Ctrl+1** and **Ctrl+2**
   - Click the **×** on a tab to close it (requires confirmation)
   - Each tab runs an independent SSH session to the same server

6. Complete your exam tasks

7. The session will automatically end when time expires

## Building

### Local Build

Build platform-specific executables locally:

```bash
# macOS
npm run build:mac

# Windows
npm run build:win

# Linux
npm run build:linux

# All platforms
npm run build
```

Executables will be in the `dist/` directory.

### Automated Releases (GitHub Actions)

The repository includes a GitHub Actions workflow that automatically builds binaries for all platforms when you create a release tag.

**To create a new release:**

1. Update version in `package.json`
2. Commit the changes
3. Create and push a git tag:
```bash
git tag v1.0.0
git push origin v1.0.0
```

4. GitHub Actions will automatically:
   - Build binaries for macOS, Windows, and Linux
   - Create a GitHub release
   - Upload all binaries to the release

**Manual trigger:**

You can also manually trigger the build from the GitHub Actions tab without creating a tag.

**Download releases:**

Pre-built binaries are available on the [Releases page](https://github.com/cleonte/safe-ssh-exam/releases).

## Session Logs

When `recordSession` is enabled, all terminal activity is logged to the `sessions/` directory (or your configured path). 

### Multi-Tab Session Logging

Each tab creates its own log file named `session-<timestamp>-tab-<tabId>.log` containing:

- Connection details
- All user input (commands typed)
- All server output (responses)
- Timestamps for all activity

For example:
- `session-1234567890-tab-1.log` - First tab
- `session-1234567890-tab-2.log` - Second tab

## Keyboard Shortcuts

### Student Shortcuts (Enabled)
- **Ctrl+T** - Open new tab (up to max limit)
- **Ctrl+1** - Switch to tab 1
- **Ctrl+2** - Switch to tab 2

### Admin Shortcuts
- **F12** - Exit application (requires admin password)
- **Cmd+Q** (macOS) / **Ctrl+Q** (Windows/Linux) - Exit application (requires admin password)
- **Red "Exit" button** in header - Exit application (requires admin password)

## Security Features

### Blocked Shortcuts

The following shortcuts are blocked to prevent students from exiting or switching applications:

- Cmd+W / Ctrl+W (Close window)
- Cmd+Tab / Alt+Tab (Switch applications)
- Cmd+M / Cmd+H (Minimize/Hide)
- F11 (Fullscreen toggle)
- Cmd+Option+Esc (Force quit menu)
- Ctrl+Alt+Delete (Task manager)
- Right-click context menu

### Additional Protections

- Kiosk mode prevents window manipulation and app switching
- Browser DevTools disabled
- Navigation and new windows blocked
- Window always stays focused
- Optional clipboard restrictions
- Tab closing requires confirmation

## Development

Run in development mode:
```bash
npm run dev
```

## Troubleshooting

### Student cannot connect

- Verify the server hostname and port in `exam-config.json`
- Ensure the SSH server is accessible from student machines
- Check student credentials are correct

### Cannot exit the application

- Press **F12** or **Cmd+Q** (macOS) / **Ctrl+Q** (Windows/Linux) to bring up the exit dialog
- Click the red **"Exit"** button in the header
- Enter the configured admin password
- If password is forgotten, you may need to force quit from Activity Monitor/Task Manager
- On macOS: Cmd+Option+Esc → Force Quit
- On Windows: Ctrl+Shift+Esc → Task Manager → End Task

### Tab-related issues

- **Cannot open new tab**: Check if you've reached the maximum tab limit (default: 2)
- **Tab closes automatically**: The SSH connection may have failed - check the terminal output in that tab
- **All tabs closed accidentally**: The application returns to the connection panel - reconnect using the same credentials

### Session logs not being created

- Check that `recordSession` is set to `true`
- Verify the `sessionRecordingPath` directory exists and is writable
- Check file permissions

## Credits

This project was developed with AI assistance using [OpenCode](https://opencode.ai).

## License

MIT
