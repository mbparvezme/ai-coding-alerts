# AI Coding Alerts

A VS Code extension that alerts you when an AI agent needs your attention — a sound, an OS notification, a window focus, and optionally a Telegram message to your phone.

Works with Claude Code and any AI agent that sends hooks to a local HTTP endpoint.

---

## Features

- **Sound alerts** — plays a sound when a permission popup appears or when the agent finishes a task
- **OS notifications** — shows a native desktop notification
- **Window focus** — brings VS Code to the foreground automatically
- **Telegram push** — sends an alert to your phone via your own Telegram bot
- **Two-way Telegram** — approve or deny permission prompts directly from the Telegram message (Approve / Deny / Approve & remember / Mute buttons)
- **Escalation** — repeats the alert sound if you don't respond, at a configurable interval
- **Mute / Snooze** — silence alerts for 15 min, 30 min, 1 hour, or indefinitely from the status bar

---

## Requirements

- VS Code 1.90 or later
- Claude Code (or another AI agent that supports outbound hooks)

---

## Quick start

1. Install the extension from the VS Code Marketplace.
2. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run **AI Coding Alerts: Install Claude Code Hooks**.
3. Start a Claude Code session — you will now hear a sound and see a notification when Claude needs your input or finishes a task.

---

## Telegram setup (optional)

To also receive alerts on your phone and approve/deny permission prompts from Telegram:

1. Message [@BotFather](https://t.me/BotFather) on Telegram and create a new bot with `/newbot`. Copy the bot token.
2. Get your chat ID by messaging [@userinfobot](https://t.me/userinfobot).
3. Open VS Code settings (`Ctrl+,`) and set:
   - `aiCodingAlerts.enableTelegramPush` → `true`
   - `aiCodingAlerts.telegramBotToken` → your bot token
   - `aiCodingAlerts.telegramChatId` → your chat ID
4. Optionally enable two-way approvals: `aiCodingAlerts.enableTelegramTwoWay` → `true` (default: on)

That's it — no account, no server, no subscription. Your bot token stays on your machine.

---

## Settings reference

| Setting | Default | Description |
|---------|---------|-------------|
| `aiCodingAlerts.popupSound` | `alarm` | Sound for a permission popup waiting for your decision |
| `aiCodingAlerts.finishedSound` | `chime` | Sound when the agent finishes a task |
| `aiCodingAlerts.popupCustomSoundPath` | `""` | Absolute path to a custom sound file for popup alerts |
| `aiCodingAlerts.finishedCustomSoundPath` | `""` | Absolute path to a custom sound file for finished alerts |
| `aiCodingAlerts.enablePopupSound` | `true` | Play a sound on permission popups |
| `aiCodingAlerts.enableFinishedSound` | `true` | Play a sound when the agent finishes |
| `aiCodingAlerts.popupAlertDelay` | `3` | Grace period in seconds before a popup sound plays |
| `aiCodingAlerts.finishedAlertDelay` | `10` | Seconds of silence before a finished-task sound plays |
| `aiCodingAlerts.enableOsNotification` | `true` | Show an OS desktop notification |
| `aiCodingAlerts.enableWindowFocus` | `true` | Bring VS Code to the foreground on an alert |
| `aiCodingAlerts.port` | `51789` | Local port the extension listens on |
| `aiCodingAlerts.enableTelegramPush` | `false` | Send alerts to Telegram |
| `aiCodingAlerts.telegramBotToken` | `""` | Your Telegram bot token |
| `aiCodingAlerts.telegramChatId` | `""` | Your Telegram chat ID |
| `aiCodingAlerts.enableTelegramTwoWay` | `true` | Show Approve/Deny buttons in Telegram messages |
| `aiCodingAlerts.permissionTimeoutSec` | `300` | Seconds to wait for a Telegram decision before falling back to the native prompt |
| `aiCodingAlerts.telegramMuteMinutes` | `480` | Duration of a Telegram Mute action |
| `aiCodingAlerts.escalationRepeats` | `3` | How many times to repeat the sound if you don't respond |
| `aiCodingAlerts.escalationInterval` | `30` | Seconds between repeated sounds |

---

## Commands

| Command | What it does |
|---------|-------------|
| AI Coding Alerts: Install Claude Code Hooks | Wires Claude Code to send alerts to this extension |
| AI Coding Alerts: Run Health Check | Confirms the extension is listening and hooks are installed |
| AI Coding Alerts: Send Test Alert | Fires a test notification through the full alert stack |
| AI Coding Alerts: Open Alert History | Shows a panel with recent alerts |
| AI Coding Alerts: Open Dashboard | Shows alert statistics |
| AI Coding Alerts: Clear History | Wipes the alert history |
| AI Coding Alerts: Snooze / Mute Alerts | Status bar button to snooze or mute |

---

## How it works

Claude Code (and other agents) send a small JSON payload to a local HTTP server the extension starts on `127.0.0.1:<port>` (default 51789). The **Install Claude Code Hooks** command writes the necessary hook scripts so Claude Code does this automatically. The extension detects the payload type (permission popup, task finished, etc.) and triggers the configured alerts.

For two-way Telegram: when a permission request arrives, the extension sends a Telegram message with Approve / Deny buttons. Whichever you tap first resolves the request. If the timeout expires with no answer, the request falls back to Claude Code's native on-screen prompt — it never auto-approves.

---

## Privacy

Everything runs locally. Your bot token and chat ID live in VS Code settings on your machine. No telemetry, no account, no external server.

---

## License

MIT — see [LICENSE](LICENSE).
