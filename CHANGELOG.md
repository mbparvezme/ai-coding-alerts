# Change Log

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
