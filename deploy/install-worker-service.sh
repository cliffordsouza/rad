#!/bin/bash
# Install RAD's Slack worker as an always-on macOS LaunchAgent.
# Keeps RAD responding: starts at login, restarts on crash/kill/reboot.
#
# Usage:
#   bash deploy/install-worker-service.sh          # install + start
#   bash deploy/install-worker-service.sh restart  # restart (after code changes)
#   bash deploy/install-worker-service.sh stop     # stop + uninstall
#   bash deploy/install-worker-service.sh status   # show status
set -e

LABEL="com.radix.rad-worker"
PLIST_SRC="$(cd "$(dirname "$0")" && pwd)/${LABEL}.plist"
PLIST_DST="$HOME/Library/LaunchAgents/${LABEL}.plist"
DOMAIN="gui/$(id -u)"

case "${1:-install}" in
  install)
    mkdir -p "$HOME/Library/LaunchAgents"
    cp "$PLIST_SRC" "$PLIST_DST"
    launchctl unload "$PLIST_DST" 2>/dev/null || true
    launchctl load -w "$PLIST_DST"
    echo "Installed + started $LABEL"
    ;;
  restart)
    launchctl kickstart -k "${DOMAIN}/${LABEL}" 2>/dev/null || {
      launchctl unload "$PLIST_DST" 2>/dev/null || true
      launchctl load -w "$PLIST_DST"
    }
    echo "Restarted $LABEL"
    ;;
  stop)
    launchctl unload "$PLIST_DST" 2>/dev/null || true
    rm -f "$PLIST_DST"
    echo "Stopped + uninstalled $LABEL"
    ;;
  status)
    launchctl print "${DOMAIN}/${LABEL}" 2>/dev/null | grep -E "state|pid|last exit" || echo "not loaded"
    ;;
esac
