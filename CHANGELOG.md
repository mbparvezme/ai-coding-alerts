# Change Log

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
