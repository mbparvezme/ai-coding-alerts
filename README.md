# AI Coding Alerts

Get a sound, an OS-level notification, and window focus the moment Claude Code (or another AI coding agent) is waiting for your confirmation.

## Features

- Local listener that any agent can POST alerts to.
- Sound alert with four built-in sounds or your own file.
- OS-level notification (terminal-notifier on macOS, `notify-send` on Linux, BurntToast on Windows).
- Brings the VS Code window to the foreground.
- **Alert History** panel: every alert with timestamp, status, and one-click sound replay.
- **Dashboard** panel: alerts today, approved/denied, average response time, peak hour, most common type.

## Setup

1. Install the extension.
2. Open the **AI Coding Alerts** view in the activity bar.
3. (Optional) Adjust settings — see below.

### Claude Code hooks

Add these hooks to your Claude Code settings (`~/.claude/settings.json`) so Claude tells the extension when it needs you:

```json
{
  "hooks": {
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:51789/alert -H \"content-type: application/json\" -d @-"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:51789/alert -H \"content-type: application/json\" -d @-"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash|Write|Edit|NotebookEdit",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:51789/alert -H \"content-type: application/json\" -d @-"
          }
        ]
      }
    ]
  }
}
```

Claude Code pipes the hook JSON on stdin; `-d @-` forwards it to the extension. The escaped double quotes keep the command portable across Windows (cmd) and Unix shells. If you change `aiCodingAlerts.port`, update the URL to match.

- `Notification` alerts when Claude is waiting for a permission confirmation or idle. **Terminal CLI only** — the Claude Code GUI (VS Code chat panel and desktop app) currently does not emit notification events.
- `Stop` alerts when Claude finishes responding and is waiting for you. Works everywhere, including the GUI. Remove it if you find per-turn alerts too chatty.
- `PreToolUse` alerts just before Claude runs a permission-gated tool — the moment a permission popup can appear in the GUI. It also fires for tools you have already allowlisted, so tune the `matcher` to the tools you actually gate.

### OS notification prerequisites

- **macOS:** `brew install terminal-notifier`
- **Linux:** `notify-send` (from `libnotify-bin`) and `wmctrl` for window focus
- **Windows:** `Install-Module -Name BurntToast -Scope CurrentUser`

## Settings

| Setting | Default | Description |
|---|---|---|
| `aiCodingAlerts.port` | `51789` | Local port the extension listens on. |
| `aiCodingAlerts.sound` | `chime` | `chime`, `ping`, `knock`, `alarm`, or `custom`. |
| `aiCodingAlerts.customSoundPath` | `""` | Absolute path used when `sound` is `custom`. |
| `aiCodingAlerts.enableOsNotification` | `true` | Toggle the OS notification. |
| `aiCodingAlerts.enableWindowFocus` | `true` | Toggle window focus on alert. |

## Test it

```bash
curl -X POST http://127.0.0.1:51789/alert \
  -H "content-type: application/json" \
  -d '{"hook_event_name":"Notification","message":"Test alert"}'
```

Or run the command **AI Coding Alerts: Send Test Alert**.

## Adding another agent

Implement `AgentDetector` (`src/detection/AgentDetector.ts`) and register it in the `DetectorRegistry` list in `src/extension.ts`. The alert layer needs no changes.
