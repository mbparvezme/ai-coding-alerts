# Change Log

## 0.7.0

- The Activity Bar icon is gone. Open the two panels from the Command Palette instead: **AI Coding Alerts: Open Alert History** and **AI Coding Alerts: Open Dashboard**. Each opens as an editor tab and reuses the same tab if already open.
- Fix the panels rendering empty: the webview now signals when it is ready and the extension pushes data in response, instead of posting once before the webview's script has loaded (which dropped the message).
- Restart the alert listener and rewrite the hook scripts only when the port setting actually changes, instead of on every settings change — no more briefly dropping alerts while unrelated settings are edited.
- Cap alert history at the 500 most recent entries so long-running installs don't accumulate an ever-growing store.
- **Snooze / mute** from the status bar: a bell item toggles alerts off for 15/30/60 minutes or indefinitely. Muting silences sound, notifications, and focus but still records history; explicit Replay still plays.
- **Repeat until acknowledged**: an unanswered popup re-rings its sound (`escalationRepeats`, default 3, every `escalationInterval` seconds). Responding or a new alert stops it.
- **Search / filter history** by text, agent, type, and date range in the Alert History panel.
- **Health check** command reports whether the listener, hooks, and scripts are set up, with one-click fixes.
- **Auto port-fallback**: if the configured port is busy, the extension binds a nearby free port and updates the hooks to match.
- **Telegram mobile push** (optional): forward alerts to your phone via a Telegram bot (`enableTelegramPush` + bot token + chat ID).

## 0.6.1

- Fix Windows hooks silently doing nothing: the `cmd /c` prefix nested inside Claude Code's own cmd invocation opened an interactive shell that swallowed the payload. Hook commands now quote the script path directly.
- The hook script checks for a listener with netstat instead of inferring from curl failures: no more duplicate alerts or multi-second stalls when the extension responds slowly; the fallback runs only when VS Code is closed.
- `PreToolUse` hooks dropped in favor of `PermissionRequest` (verified firing in the VS Code GUI): popup alerts now trigger only for real permission dialogs, never for allowlisted tools.

## 0.6.0

- Popup alerts get a grace period (`popupAlertDelay`, default 3s): acting on the popup before it elapses dismisses the alert. `PostToolUse` events signal the action.
- `PermissionRequest` hook support: popup alerts fire exactly when a permission dialog appears.
- `activity` hook kind: silent in the fallback scripts, cancels pending alerts in the extension.

## 0.5.0

- Finished alerts wait for a quiet period (`finishedAlertDelay`, default 10s) so intermediate completions while Claude keeps working stay silent; only the final completion plays.

## 0.4.0

- One-click Claude Code hook setup: first-run prompt plus an "Install Claude Code Hooks" command. Merges hooks into `~/.claude/settings.json` idempotently (backup written first), deploys scripts and sounds to the stable `~/.ai-coding-alerts/` folder, and re-syncs them when the port setting changes.
- Fallback hooks for Windows, macOS, and Linux: forward to the extension when VS Code is listening, play the sound (and show an OS notification when available) directly when it is not.

## 0.3.0

- Separate sounds for popup (pending decision) and finished-response alerts, each with its own built-in choice, custom file path, and on/off toggle. Replaces `aiCodingAlerts.sound` and `aiCodingAlerts.customSoundPath`.
- Settings UI ordered: popup controls first, then finished, notification, focus, port.
- History replay plays the sound matching the alert's type.

## 0.2.0

- Claude Code `PreToolUse` hook support: "permission" alerts fire the moment a permission popup can appear, covering the VS Code chat panel and desktop app where `Notification` events never arrive.

## 0.1.1

- Working Windows audio: SoundPlayer for WAV, winmm MCI for MP3, quote-safe encoded commands, hidden-console spawn.
- Four extra bundled MP3 sounds: drop, frog, swip, wire.
- Claude Code `Stop` hook support: "finished responding" alerts, the reliable signal in the desktop app.
- Windows-compatible hook snippet in the README.

## 0.1.0

- Initial release: local alert listener, sound/OS-notification/window-focus reactors, alert history, and stats dashboard.
