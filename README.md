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

### Claude Code hook

Add a `Notification` hook to your Claude Code settings (`~/.claude/settings.json`) so Claude tells the extension when it is waiting:

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
    ]
  }
}
```

Claude Code pipes the hook JSON on stdin; `-d @-` forwards it to the extension. The escaped double quotes keep the command portable across Windows (cmd) and Unix shells. If you change `aiCodingAlerts.port`, update the URL to match. Hooks are captured when a session starts, so restart Claude Code after adding this.

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
