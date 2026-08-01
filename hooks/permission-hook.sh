#!/bin/sh
# Two-way permission hook. Reads the PermissionRequest payload on stdin, asks the
# AI Coding Alerts extension for an approve/deny decision (via Telegram), and
# returns it to Claude Code. No listener or a timeout → no output → native dialog.
PORT="${AICA_PORT:-51789}"
BASE="http://127.0.0.1:$PORT"
ID=$(curl -s --connect-timeout 1 --max-time 5 -X POST "$BASE/permission" \
  -H "content-type: application/json" -d @- \
  | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
[ -z "$ID" ] && exit 0
i=0
while [ "$i" -lt 160 ]; do
  STATUS=$(curl -s --max-time 10 "$BASE/decision/$ID" \
    | sed -n 's/.*"status"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
  case "$STATUS" in
    allow) printf '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}\n'; exit 0 ;;
    deny)  printf '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny"}}}\n'; exit 0 ;;
    pending) ;;
    *) exit 0 ;;
  esac
  sleep 2
  i=$((i + 1))
done
exit 0
