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

On first run the extension offers to set up the hooks for you — click **Set up** and you are done. You can rerun this anytime with **AI Coding Alerts: Install Claude Code Hooks** from the command palette. Automatic setup copies the hook scripts to `~/.ai-coding-alerts/` (a stable path that survives extension updates), merges the hooks into `~/.claude/settings.json` without touching your other settings (a `.backup` copy is written first), and keeps the scripts in sync when you change the port.

To set them up by hand instead, add these hooks to your Claude Code settings (`~/.claude/settings.json`):

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

### Alerts without VS Code

The plain `curl` hooks above only reach the extension while VS Code is running. Automatic setup instead points the hooks at `alert-hook.cmd` (Windows) or `alert-hook.sh` (macOS/Linux) in `~/.ai-coding-alerts/`. These forward the payload to the extension when it is listening; when nothing answers (VS Code closed — for example while using the Claude Code desktop app or terminal CLI alone), the companion fallback script plays the alert sound directly (alarm for popups, chime for finished — edit the table at the top of the fallback script to change them) and shows an OS notification when available (BurntToast on Windows, `osascript` on macOS, `notify-send` on Linux). Alerts that arrive while VS Code is closed are not recorded in the history or dashboard.

For manual use, the same scripts live in this repository's `hooks/` folder — pass `popup` for `Notification` and `PreToolUse` hooks and `finished` for `Stop`.

### OS notification prerequisites

- **macOS:** `brew install terminal-notifier`
- **Linux:** `notify-send` (from `libnotify-bin`) and `wmctrl` for window focus
- **Windows:** `Install-Module -Name BurntToast -Scope CurrentUser`

## Settings

Popup alerts (a permission popup with options is waiting for you) and finished alerts (the AI completed a response) each have their own sound, custom path, and toggle. Built-in sounds: `chime`, `ping`, `knock`, `alarm`, `drop`, `frog`, `swip`, `wire`.

| Setting | Default | Description |
|---|---|---|
| `aiCodingAlerts.popupSound` | `alarm` | Sound for popup alerts; `custom` uses your own file. |
| `aiCodingAlerts.finishedSound` | `chime` | Sound for finished-response alerts; `custom` uses your own file. |
| `aiCodingAlerts.popupCustomSoundPath` | `""` | Absolute path used when `popupSound` is `custom`. |
| `aiCodingAlerts.finishedCustomSoundPath` | `""` | Absolute path used when `finishedSound` is `custom`. |
| `aiCodingAlerts.enablePopupSound` | `true` | Toggle the popup alert sound. |
| `aiCodingAlerts.enableFinishedSound` | `true` | Toggle the finished-response sound. |
| `aiCodingAlerts.popupAlertDelay` | `3` | Grace seconds before a popup alert plays; acting on the popup first dismisses it. |
| `aiCodingAlerts.finishedAlertDelay` | `10` | Seconds of silence before a finished alert plays; intermediate completions are skipped. |
| `aiCodingAlerts.enableOsNotification` | `true` | Toggle the OS notification. |
| `aiCodingAlerts.enableWindowFocus` | `true` | Toggle window focus on alert. |
| `aiCodingAlerts.port` | `51789` | Local port the extension listens on. |

## Test it

```bash
curl -X POST http://127.0.0.1:51789/alert \
  -H "content-type: application/json" \
  -d '{"hook_event_name":"Notification","message":"Test alert"}'
```

Or run the command **AI Coding Alerts: Send Test Alert**.

## Adding another agent

Implement `AgentDetector` (`src/detection/AgentDetector.ts`) and register it in the `DetectorRegistry` list in `src/extension.ts`. The alert layer needs no changes.
