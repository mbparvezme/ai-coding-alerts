# AI Coding Alerts

**Never miss the moment your AI assistant needs you.**

When you ask Claude Code to work on something, it often needs a while — and then suddenly it's waiting for *you*: a permission popup needs a Yes or No, or the answer is ready. If you've switched to another window in the meantime, you find out minutes later.

AI Coding Alerts fixes that. The moment Claude Code needs your attention, you get a **sound**, an optional **desktop notification**, and VS Code comes to the **foreground** — even if you were reading email or watching a video.

## What it does

- 🔔 **Popup alert** — plays a sound the instant a permission popup appears and waits for your decision.
- ✅ **Finished alert** — plays a different sound when Claude has completely finished its work and is idle.
- 🖥️ **Desktop notification and window focus** — optional, both can be turned off.
- 📜 **Alert History panel** — every alert with its time and message, plus a replay button.
- 📊 **Dashboard panel** — today's alert count, approvals/denials, average response time, busiest hour.
- 🔇 **Smart timing** — no alert spam:
  - If you answer a popup *before* the alert plays, the alert is cancelled. You were already there — no need to ring.
  - While Claude is still working through a multi-step task, intermediate "done" moments stay silent. The finished sound plays only after real silence, meaning the task is truly complete.
- 🚪 **Works even when VS Code is closed** — alerts from the Claude Code desktop app or terminal still play a sound.
- 🔕 **Snooze / mute from the status bar** — one click to silence alerts for 15/30/60 minutes or until you turn them back on.
- 🔁 **Repeat until acknowledged** — an unanswered popup keeps nudging you until you respond.
- 📱 **Mobile push via Telegram** — optionally get alerts on your phone, even away from your desk.
- 🩺 **Health check** — one command tells you if everything's wired up correctly.

## Getting started

1. **Install the extension** in VS Code.
2. **Set up the Claude Code hooks.** On first run, a message appears: *"AI Coding Alerts needs Claude Code hooks to receive alerts. Set them up automatically?"* — click **Set up**. That's it.
3. Try it: open the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run **AI Coding Alerts: Send Test Alert**. You should hear a sound.

> **What does "Set up" actually do?** Claude Code can run small scripts (called *hooks*) when certain things happen — like a permission popup appearing. Setup copies the alert scripts to a folder in your home directory (`~/.ai-coding-alerts/`) and registers them in your Claude Code settings file. Your existing settings are untouched, and a backup copy is saved first.

### Missed the setup message?

The first-run message appears only once, and clicking **Don't ask again** hides it for good. If you dismissed it — or you're not sure the hooks were ever installed — you can run the setup yourself at any time:

1. Open the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
2. Type **AI Coding Alerts** and select **AI Coding Alerts: Install Claude Code Hooks**.
3. A confirmation appears once the hooks are registered. Now run **AI Coding Alerts: Send Test Alert** to confirm you hear a sound.

This does exactly the same thing as the **Set up** button. It's safe to run even if setup already happened — it only adds this extension's hooks, never duplicates them, and always backs up your Claude Code settings first. Run it again any time the alerts stop working (for example after you move the extension or edit your Claude Code settings).

## The two alert types

| | **Popup alert** | **Finished alert** |
|---|---|---|
| When | A permission popup is on screen, waiting for your decision | Claude finished everything and is idle |
| Default sound | `alarm` | `chime` |
| Default timing | Plays after 3 seconds — cancelled if you answer first | Plays after 10 seconds of silence |

The waiting times are the trick that keeps alerts meaningful:

- **Popup delay (3 s):** if you're already at the keyboard and click Allow right away, the alert never plays. If you've wandered off, it rings 3 seconds after the popup appeared.
- **Finished delay (10 s):** Claude reports "done" after every message segment, even mid-task. The extension waits — if Claude keeps working, those signals are discarded. Only 10 quiet seconds mean the real end.

Both delays are adjustable, and `0` disables the waiting entirely.

## Customizing

Open VS Code Settings (`Ctrl+,` / `Cmd+,`) and search for **AI Coding Alerts**. The controls appear in this order:

1. **Popup Sound** — pick from 8 built-in sounds, or `custom` for your own file.
2. **Finished Sound** — same choices, independent of the popup sound.
3. **Popup Custom Sound Path** — full path to your own `.wav` or `.mp3`, used when Popup Sound is `custom` (e.g. `D:\sounds\bell.mp3`).
4. **Finished Custom Sound Path** — same, for the finished alert.
5. **Enable Popup Sound** — turn popup sounds on/off.
6. **Enable Finished Sound** — turn finished sounds on/off.
7. **Popup Alert Delay** — the grace period in seconds (default 3).
8. **Finished Alert Delay** — the quiet period in seconds (default 10).
9. **Enable Os Notification** — desktop notification on/off.
10. **Enable Window Focus** — bring VS Code to the front on/off.
11. **Port** — the local port the extension listens on (default 51789). Change it only if another program uses that port; the hook scripts are updated automatically. If the port is busy, the extension picks a nearby free one on its own and updates the hooks to match.
12. **Enable Telegram Push** — also send alerts to your phone (see [Mobile alerts via Telegram](#mobile-alerts-via-telegram)).
13. **Telegram Bot Token** — the token for your Telegram bot.
14. **Telegram Chat ID** — where the bot sends your alerts.
15. **Escalation Repeats** — how many times an unanswered popup repeats its sound (default 3, `0` turns it off).
16. **Escalation Interval** — seconds between those repeats (default 30).

Built-in sounds: `chime`, `ping`, `knock`, `alarm`, `drop`, `frog`, `swip`, `wire`. To audition one, pick it and run **AI Coding Alerts: Send Test Alert**.

All changes take effect immediately — no restart needed.

## The panels

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run one of these to open a panel:

- **AI Coding Alerts: Open Alert History** — every alert with its message and time. Mark entries Approved/Denied to feed the statistics, or hit **Replay** to hear that alert's sound again. Clear it anytime with **AI Coding Alerts: Clear History**.
- **AI Coding Alerts: Open Dashboard** — live stats: alerts today, approved vs. denied, average time you take to respond, your peak alert hour, and the most common alert type.

The History panel also has a **search box and Agent / Type / Date filters** so you can quickly find a past alert.

## Snooze and mute

A **🔔 Alerts** item sits in the status bar (bottom-left). Click it to snooze alerts for **15, 30, or 60 minutes**, or **mute until you turn them back on**. While muted it shows **🔕 Alerts muted**, sound / notifications / focus are silenced, but alerts are still recorded in History so you can see what you missed. Clicking **Replay** in the History panel always plays, even while muted.

## Repeat until acknowledged

If a popup is waiting and you don't respond, the popup sound repeats every **Escalation Interval** seconds, up to **Escalation Repeats** times, then stops on its own. Responding to the popup (or a new alert arriving) cancels the repeats immediately. Set **Escalation Repeats** to `0` to disable this.

## Mobile alerts via Telegram

Want alerts on your phone when you step away? Set up a free Telegram bot:

1. In Telegram, message **@BotFather**, send `/newbot`, and follow the prompts. It gives you a **bot token** (like `123456:ABC-DEF...`).
2. Message **@userinfobot** to get your **chat ID** (a number).
3. Open the new bot's chat and send it any message once (Telegram requires this before a bot can message you).
4. In VS Code Settings: turn on **Enable Telegram Push**, paste the **Telegram Bot Token** and **Telegram Chat ID**.
5. Run **AI Coding Alerts: Send Test Alert** — you should get a message on your phone.

Alerts are sent directly to Telegram from your machine. Muting the extension also pauses Telegram push.

## Something not working?

Run **AI Coding Alerts: Run Health Check** from the Command Palette. It checks that the extension is listening, the Claude Code hooks are registered, and the alert scripts are deployed — and offers to fix anything that's missing.

## Alerts when VS Code is closed

You still get sounds when using the **Claude Code desktop app** or the **terminal CLI** with VS Code closed. The hook script first tries to reach the extension; if VS Code isn't running, it plays the sound itself (alarm for popups, chime for finished) and shows a desktop notification when available.

Two small limitations in that mode: alerts aren't recorded in History/Dashboard (nothing is running to store them), and the fallback sounds are fixed to alarm/chime unless you edit the table at the top of `~/.ai-coding-alerts/alert-fallback.ps1` (Windows) or `alert-fallback.sh` (macOS/Linux).

## Desktop notification requirements (optional)

Sounds and window focus work out of the box. The desktop notification bubble needs one small helper, depending on your system:

- **Windows:** run `Install-Module -Name BurntToast -Scope CurrentUser` in PowerShell
- **macOS:** `brew install terminal-notifier` (the fallback script uses the built-in notifier instead)
- **Linux:** `notify-send` (package `libnotify-bin`) and `wmctrl` for window focus

Without these, notifications are silently skipped — everything else keeps working.

## Troubleshooting

- **No sound at all?** Run **AI Coding Alerts: Send Test Alert**. If that plays, the extension is fine — rerun **AI Coding Alerts: Install Claude Code Hooks** to repair the hooks, then start a new Claude Code conversation.
- **"Port 51789 is unavailable" warning?** Another program (often a second VS Code window) is using the port. Close extra windows, or change the Port setting.
- **Alert plays but you already answered?** Increase **Popup Alert Delay** — it's the window in which your answer cancels the alert.
- **Finished sound during long tasks?** Increase **Finished Alert Delay** so short pauses don't count as "done".

## For advanced users

### Manual hook setup

If you prefer editing `~/.claude/settings.json` yourself, register these events (this is the simple `curl` variant — it works only while VS Code is running):

```json
{
  "hooks": {
    "PermissionRequest": [
      { "hooks": [ { "type": "command", "command": "curl -s -X POST http://127.0.0.1:51789/alert -H \"content-type: application/json\" -d @-" } ] }
    ],
    "Stop": [
      { "hooks": [ { "type": "command", "command": "curl -s -X POST http://127.0.0.1:51789/alert -H \"content-type: application/json\" -d @-" } ] }
    ],
    "PostToolUse": [
      { "matcher": "Bash|Write|Edit|NotebookEdit", "hooks": [ { "type": "command", "command": "curl -s -X POST http://127.0.0.1:51789/alert -H \"content-type: application/json\" -d @-" } ] }
    ],
    "Notification": [
      { "hooks": [ { "type": "command", "command": "curl -s -X POST http://127.0.0.1:51789/alert -H \"content-type: application/json\" -d @-" } ] }
    ]
  }
}
```

What each event does:

- `PermissionRequest` — fires the moment a permission dialog appears. The main popup signal; works in the VS Code chat panel and the desktop app.
- `Stop` — fires when Claude finishes responding.
- `PostToolUse` — a silent activity signal: it dismisses a pending popup alert when you approve quickly and keeps intermediate completions quiet.
- `Notification` — waiting/idle notices. Terminal CLI only; the GUI does not emit these.

For the closed-VS-Code fallback, point the commands at the scripts in `~/.ai-coding-alerts/` instead (this is what automatic setup does): `"C:\Users\you\.ai-coding-alerts\alert-hook.cmd" popup` on Windows or `"/home/you/.ai-coding-alerts/alert-hook.sh" popup` elsewhere. Pass `popup` for `PermissionRequest`/`Notification`, `finished` for `Stop`, and `activity` for `PostToolUse`. On Windows, do **not** wrap the command in `cmd /c` — Claude Code already runs hooks through cmd, and the nested quoting breaks silently.

### Testing from a terminal

```bash
curl -X POST http://127.0.0.1:51789/alert \
  -H "content-type: application/json" \
  -d '{"hook_event_name":"Notification","message":"Test alert"}'
```

### Settings reference

| Setting ID | Default |
|---|---|
| `aiCodingAlerts.popupSound` | `alarm` |
| `aiCodingAlerts.finishedSound` | `chime` |
| `aiCodingAlerts.popupCustomSoundPath` | `""` |
| `aiCodingAlerts.finishedCustomSoundPath` | `""` |
| `aiCodingAlerts.enablePopupSound` | `true` |
| `aiCodingAlerts.enableFinishedSound` | `true` |
| `aiCodingAlerts.popupAlertDelay` | `3` |
| `aiCodingAlerts.finishedAlertDelay` | `10` |
| `aiCodingAlerts.enableOsNotification` | `true` |
| `aiCodingAlerts.enableWindowFocus` | `true` |
| `aiCodingAlerts.port` | `51789` |

### Contributing / modifying the code

See **[DEVELOPMENT.md](DEVELOPMENT.md)** for the architecture, module map, how to add settings/sounds/agents/alert types, the build-test-package-publish workflow, and the platform gotchas worth knowing before touching the Windows/hook code.

In short: the extension is agent-agnostic — anything that can POST JSON to `http://127.0.0.1:51789/alert` can raise alerts. To add first-class support for a new agent, implement `AgentDetector` (`src/detection/AgentDetector.ts`) and register it in the `DetectorRegistry` list in `src/extension.ts`; the alert, history, and dashboard layers need no changes.
