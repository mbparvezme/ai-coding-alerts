#!/bin/sh
# Forwards the Claude Code hook payload to the AI Coding Alerts extension.
# When no listener is up (VS Code closed), plays the alert sound directly.
# Usage: alert-hook.sh popup|finished
if curl -s --connect-timeout 1 --max-time 5 -X POST http://127.0.0.1:51789/alert -H "content-type: application/json" -d @- >/dev/null 2>&1; then
  exit 0
fi
"$(dirname "$0")/alert-fallback.sh" "$1" </dev/null >/dev/null 2>&1 &
exit 0
