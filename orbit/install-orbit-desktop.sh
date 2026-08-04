#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAUNCHER="$ROOT_DIR/start-orbit-desktop.sh"
PLATFORM="$(uname -s)"

chmod +x "$LAUNCHER"
"$LAUNCHER"

if [[ "$PLATFORM" == "Darwin" ]]; then
  APPS_DIR="$HOME/Applications"
  AGENTS_DIR="$HOME/Library/LaunchAgents"
  mkdir -p "$APPS_DIR" "$AGENTS_DIR"
  cp "$LAUNCHER" "$APPS_DIR/Orbit Desktop.command"
  chmod +x "$APPS_DIR/Orbit Desktop.command"
  PLIST="$AGENTS_DIR/com.orbit.desktop.plist"
  cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>com.orbit.desktop</string>
<key>ProgramArguments</key><array><string>/bin/bash</string><string>$LAUNCHER</string></array>
<key>RunAtLoad</key><true/>
</dict></plist>
EOF
  launchctl bootout "gui/$UID/com.orbit.desktop" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$UID" "$PLIST"
  echo "Orbit installed in $APPS_DIR and will start when you sign in."
elif [[ "$PLATFORM" == "Linux" ]]; then
  APPS_DIR="$HOME/.local/share/applications"
  AUTOSTART_DIR="$HOME/.config/autostart"
  mkdir -p "$APPS_DIR" "$AUTOSTART_DIR"
  DESKTOP_ENTRY="[Desktop Entry]
Type=Application
Name=Orbit Desktop
Comment=Launch Orbit Desktop Companion
Exec=/bin/bash \"$LAUNCHER\"
Terminal=false
Categories=Utility;"
  printf '%b\n' "$DESKTOP_ENTRY" >"$APPS_DIR/orbit-desktop.desktop"
  printf '%b\n' "$DESKTOP_ENTRY" >"$AUTOSTART_DIR/orbit-desktop.desktop"
  chmod +x "$APPS_DIR/orbit-desktop.desktop" "$AUTOSTART_DIR/orbit-desktop.desktop"
  echo "Orbit installed in the application menu and will start when you sign in."
else
  echo "Unsupported platform: $PLATFORM" >&2
  exit 1
fi

