ORBIT DESKTOP
=============

WINDOWS
-------
1. Extract the entire ZIP file.
2. Double-click install-orbit-desktop.cmd.
3. Orbit appears near the lower-right corner of the desktop.
4. Click Orbit to open chat and begin listening.

The installer creates an Orbit Desktop shortcut and starts Orbit with Windows.
Use Orbit's three-dot menu to restart, disable always-on-top, or quit.

MACOS OR LINUX
--------------
1. Extract the entire ZIP file.
2. Open Terminal in the extracted folder.
3. Run: chmod +x install-orbit-desktop.sh start-orbit-desktop.sh
4. Run: ./install-orbit-desktop.sh

The installer adds Orbit to startup and creates an Applications launcher on
macOS or an application-menu entry on Linux.

Requirements:
- Windows 10/11, macOS, or a modern Linux desktop
- Internet access during the first install
- Node.js 20 or newer: https://nodejs.org/

Configuration:
Edit desktop\desktop-config.json to set the default skin,
conversation backend URL, and backend action buttons.
