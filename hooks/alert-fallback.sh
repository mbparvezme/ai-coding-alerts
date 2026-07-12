#!/bin/sh
kind="${1:-popup}"

case "$kind" in
  finished)
    file="chime.wav"
    message="Claude Code finished responding"
    ;;
  popup)
    file="alarm.wav"
    message="Claude Code is waiting for your decision"
    ;;
  *)
    exit 0
    ;;
esac

base="$(cd "$(dirname "$0")" && pwd)"
dir="$base/sounds"
[ -d "$dir" ] || dir="$base/../media/sounds"
sound="$dir/$file"
[ -f "$sound" ] || exit 0

if [ "$(uname)" = "Darwin" ]; then
  osascript -e "display notification \"$message\" with title \"AI Coding Alerts\"" >/dev/null 2>&1
  afplay "$sound"
else
  command -v notify-send >/dev/null 2>&1 && notify-send -u critical "AI Coding Alerts" "$message"
  command -v ffplay >/dev/null 2>&1 && ffplay -nodisp -autoexit -loglevel quiet "$sound"
fi
