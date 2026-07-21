# Development Guide

This document is for anyone modifying **AI Coding Alerts**. It explains how the code is organized, how to make common changes, how to build and ship, and — most importantly — *why* certain unusual choices were made, so they don't get "fixed" back into bugs.

For user-facing docs (install, settings, usage), see [README.md](README.md).

## Table of contents

- [Big picture](#big-picture)
- [The alert pipeline](#the-alert-pipeline)
- [Module map](#module-map)
- [Common tasks](#common-tasks)
- [Build, test, package, publish](#build-test-package-publish)
- [Testing philosophy](#testing-philosophy)
- [Hard-won gotchas — read before touching platform code](#hard-won-gotchas--read-before-touching-platform-code)

## Big picture

The extension is a small local server plus a set of reactions. A Claude Code **hook** POSTs a JSON event to `http://127.0.0.1:<port>/alert`; the extension turns that event into an **Alert** and fans it out to **reactors** (play sound, show OS notification, focus window, record history).

Two design rules hold the whole thing together:

1. **The core is decoupled from VS Code.** Everything under `src/` that isn't a `*Panel`, `ConfigService`, `extension.ts`, or `HookInstaller` is plain TypeScript with no `import "vscode"`. That keeps the logic unit-testable with the Node test runner and no VS Code host. Dependencies on the editor are injected in from `extension.ts`.

2. **Detection is separate from reaction.** Recognizing *who* sent an event and *what kind* it is (`src/detection`) is independent from *what happens* as a result (`src/reactors`). Adding a new agent never touches the alert layer, and adding a new reaction never touches detection.

## The alert pipeline

```
Claude Code hook (curl / alert-hook script)
        │  HTTP POST /alert  { hook_event_name, ... }
        ▼
IngressServer            src/ingress/IngressServer.ts     — receives POST, parses JSON
        ▼
DetectorRegistry         src/detection/DetectorRegistry.ts — first detector that canHandle() wins
        ▼
ClaudeCodeDetector       src/detection/ClaudeCodeDetector.ts — payload → Alert { type, message }
        ▼
AlertScheduler           src/alert/AlertScheduler.ts       — debounces / dismisses by timing
        ▼
AlertBus                 src/alert/AlertBus.ts             — awaits each reactor, isolates errors
        ├──► SoundPlayer      src/reactors/SoundPlayer.ts
        ├──► OsNotifier       src/reactors/OsNotifier.ts
        ├──► WindowFocuser    src/reactors/WindowFocuser.ts
        └──► history.add()    src/history/HistoryStore.ts
```

**Alert types** (set by the detector, consumed downstream):

| `type` | Raised by hook event | Meaning | Sound |
|---|---|---|---|
| `permission` | `PermissionRequest`, `PreToolUse` | A popup is waiting for a decision | popup sound |
| `notification` | `Notification` | Waiting/idle (terminal CLI only) | popup sound |
| `completion` | `Stop` | Claude finished responding | finished sound |
| `activity` | `PostToolUse`, `PostToolUseFailure` | Claude is still working — **silent signal** | none |

The `activity` type never plays anything. It exists only so the `AlertScheduler` can *cancel* a pending popup or completion (see below).

### Why the scheduler exists

The Claude Code GUI has two annoying behaviours the scheduler works around:

- `Stop` fires after **every assistant message segment**, not just at the true end of a task. Without debouncing you'd hear the finished sound repeatedly mid-task.
- A permission popup can be answered by the user **before** the alert is worth playing.

`AlertScheduler` holds popup and completion alerts for a grace period (`popupAlertDelay`, `finishedAlertDelay`). Any newer alert or an `activity` signal **cancels** the one being held:

- Approve a popup quickly → `PostToolUse` (activity) arrives → pending popup cancelled, no sound.
- Claude keeps working → more events arrive → pending completion cancelled; only genuine silence lets it fire.

A delay of `0` emits immediately (no holding).

## Module map

```
src/
  extension.ts            Composition root. Wires everything, owns the VS Code lifecycle.
  model/
    Alert.ts              The Alert type + createAlert() factory.
  util/
    id.ts                 newId() for alert ids.
  ingress/
    IngressServer.ts      node:http server on 127.0.0.1. POST /alert → onPayload.
  detection/
    AgentDetector.ts      Interface: canHandle(payload) + parse(payload) → Alert.
    ClaudeCodeDetector.ts The only detector today. Maps hook_event_name → Alert type/message.
    DetectorRegistry.ts   Holds detectors; first canHandle() wins.
  alert/
    Reactor.ts            Interface: react(alert).
    AlertBus.ts           Fans an alert out to reactors, one try/catch each.
    AlertScheduler.ts     Timing layer: debounce completions, dismiss popups on activity.
  reactors/
    SoundPlayer.ts        Resolves the right sound for the alert type, runs the play command.
    OsNotifier.ts         OS notification, gated by enableOsNotification.
    WindowFocuser.ts      Foregrounds the window, gated by enableWindowFocus.
  platform/
    Platform.ts           Os type, Command type, currentOs().
    runCommand.ts         Spawns a Command (fire-and-forget, windowsHide).
    soundCommand.ts       Per-OS sound command builder.
    notifyCommand.ts      Per-OS notification command builder.
    focusCommand.ts       Per-OS window-focus command builder.
  config/
    ConfigService.ts      Reads aiCodingAlerts.* settings; onDidChange.
    soundResolver.ts      Maps a sound choice to a file path; picks popup vs finished choice.
  history/
    HistoryStore.ts       Persists alerts in globalState (injected KeyValueStore), onDidChange.
  stats/
    StatsService.ts       Pure computeStats(alerts, now) → dashboard numbers.
  setup/
    hookCommands.ts       Generates the per-OS hook command strings + desired hook list.
    hooksMerge.ts         Idempotent merge of our hooks into a settings object.
    HookInstaller.ts      Deploys scripts to ~/.ai-coding-alerts, writes ~/.claude/settings.json.
  views/
    webviewHtml.ts        Shared webview HTML shell (CSP, nonce, asset URIs).
    HistoryPanel.ts       On-demand history webview panel; approve/deny/replay messages.
    DashboardPanel.ts     On-demand dashboard webview panel; renders StatsService output.

hooks/                    Shipped in the VSIX, deployed to ~/.ai-coding-alerts on setup.
  alert-hook.cmd/.sh      Forward to the extension, or run the fallback if it's closed.
  alert-fallback.ps1/.sh  Play the sound directly (used only when VS Code is closed).

media/                    panel.css, history.js, dashboard.js, icon.png (marketplace), sounds/*.

test/                     Mirrors src/. Node test runner. No vscode import anywhere.
```

## Common tasks

### Add a new setting

1. Declare it under `contributes.configuration.properties` in `package.json` with an `order` (keep the settings UI ordering intentional).
2. Read it in `ConfigService.read()` and add the field to `AlertSettings`.
3. Use it where needed. If a reactor needs it, pass a getter (`() => config.read().yourField`) from `extension.ts` so it always reads live — settings can change at runtime.

### Add a new sound

1. Drop the file in `media/sounds/`.
2. Add it to the `BUILT_IN` map in `src/config/soundResolver.ts`.
3. Add its key to both `enum` arrays (`popupSound`, `finishedSound`) in `package.json`.
4. The fallback scripts copy `media/sounds/` wholesale, so they need no change — but if you want it as a *fallback default*, edit the sound table at the top of `hooks/alert-fallback.ps1` / `.sh`.

### Add a new alert type / react to a new hook event

1. In `ClaudeCodeDetector.ts`, add the event name to `HANDLED_EVENTS` and map it to an alert `type` and `message` in `parse()`.
2. Decide its timing in `AlertScheduler.push()` (does it play immediately, get held, or act as a silent cancel signal like `activity`?).
3. If it should trigger a hook, add it to the `EVENTS` list in `src/setup/hookCommands.ts` with the right `kind` (`popup` / `finished` / `activity`) and optional `matcher`. Re-running setup (or `installHooks`) rewrites the user's settings.
4. Map the `type` to a sound in `soundResolver.ts` (`soundChoiceFor`) if it isn't `activity`.
5. Add tests in `test/detection/` and `test/alert/`.

### Add a whole new agent (not Claude Code)

1. Implement `AgentDetector` (`canHandle` + `parse`) in `src/detection/`.
2. Register it in the `DetectorRegistry([...])` list in `extension.ts`. First match wins, so order matters if payloads overlap.
3. Nothing in the alert, reactor, history, or view layers changes.

### Add a new reactor (a new kind of reaction)

1. Implement `Reactor` (`react(alert)`) in `src/reactors/`.
2. Add it to the `AlertBus([...])` list in `extension.ts`.
3. If it shells out, build the command in `src/platform/` and run it via `runCommand` — don't spawn directly (see gotchas).

## Build, test, package, publish

All commands run from `D:\ai-coding-alerts`.

```bash
npm install            # once
npm run build          # esbuild → dist/extension.js
npm run watch          # rebuild on change
npm test               # node --test over test/**/*.test.ts (tsx loader)
```

Package and install locally:

```bash
npx @vscode/vsce package                       # → ai-coding-alerts-<version>.vsix
code --install-extension ai-coding-alerts-<version>.vsix --force
```

Then **reload the VS Code window** (`Developer: Reload Window`) — installing a VSIX doesn't reload an already-running host.

Publish (see README's publish section for the full credential flow):

```bash
npx @vscode/vsce login mbparvezme    # paste PAT (user only)
npx @vscode/vsce publish             # or: publish minor / publish 1.0.0
```

`vscode:prepublish` runs the production esbuild automatically. Bump `version` in `package.json` and add a `CHANGELOG.md` entry for every release.

### What ships in the VSIX

Controlled by `.vscodeignore`. Included: `dist/`, `hooks/`, `media/` (incl. both icons + sounds), `README`, `CHANGELOG`, `LICENSE`, `package.json`. Excluded: `src/`, `test/`, all `*.ts`, source maps, `*.vsix`. If you add a runtime asset, confirm it lands in the VSIX file list that `vsce package` prints.

## Testing philosophy

- **Runner:** Node's built-in test runner via `node --import tsx --test`. No Jest, no VS Code test harness.
- **No `vscode` in tests.** Every tested module takes its dependencies as constructor args or function params. Examples: `HistoryStore` takes a `KeyValueStore`; `AlertScheduler` takes `schedule`/`cancel` functions so timers are synchronous and deterministic in tests; `SoundPlayer` takes a `CommandRunner`.
- **Pure functions where possible.** `StatsService.computeStats(alerts, now)`, `soundResolver`, `hooksMerge`, `hookCommands` are all pure — trivially testable, no mocks.
- **Platform command builders return `Command` objects**, they don't execute. Tests assert on the command/args, not on sound actually playing.

When adding logic, prefer putting it in a pure module and testing it there, rather than in `extension.ts` (which has no tests — keep it thin, just wiring).

## Hard-won gotchas — read before touching platform code

Each of these cost real debugging time. Changing the code back to the "obvious" version reintroduces a bug.

**Windows hooks must not be wrapped in `cmd /c`.** Claude Code already runs hook commands through `cmd`. Wrapping ours in another `cmd /c "..."` makes Windows open an *interactive* shell that prints a banner, swallows the piped JSON as console input, and runs nothing — while reporting success. Correct hook command: `"C:\path\alert-hook.cmd" popup` (quoted path, no prefix). See `hookCommands.ts`.

**The fallback script gates on `netstat`, not curl's exit code.** The ingress server shares the extension-host event loop with Claude Code; under load it can take 5–17s to respond. If we inferred "extension is down" from a curl timeout, we'd fire the fallback sound *and* the extension would (often) also process the late request → double alerts and multi-second stalls. `alert-hook.cmd` checks `netstat ... LISTENING` first and only runs the fallback when nothing is listening.

**Use `PermissionRequest`, not `PreToolUse`, for popup alerts.** `PermissionRequest` fires only when a real permission dialog appears, so it never rings for allowlisted tools. `PreToolUse` fires for every tool call including auto-approved ones. (Both are still *handled* by the detector for flexibility, but setup wires `PermissionRequest`.)

**Never spawn PowerShell `detached: true` from Node on Windows** — it dies in ~400ms with no console attached. Use non-detached with `windowsHide: true` (`runCommand.ts`). From a `.cmd` file, `start "" /b` is *not* enough to detach — it keeps the stdout pipe and blocks the caller; use `powershell -Command "Start-Process ..."`.

**PowerShell scripts are passed as `-EncodedCommand` (base64 UTF-16LE), not `-Command`.** Raw `-Command` loses double quotes when arguments cross the Node argv boundary, corrupting file paths. See `encodedPowershell()` in `soundCommand.ts`.

**Sound playback: `SoundPlayer` for WAV, winmm `mciSendString` for MP3.** `System.Windows.Media.MediaPlayer` never loads media in console PowerShell (no WPF dispatcher) — it fails silently. Don't switch to it.

**Hook scripts live at a stable path, not the extension folder.** The extension's install directory changes on every version (`...ai-coding-alerts-0.6.1\`), which would break hook paths on update. `HookInstaller` copies scripts + sounds to `~/.ai-coding-alerts/` and refreshes them on activation. The port is substituted into the copied scripts at deploy time, and re-substituted when `port` changes.

**`hooksMerge` is idempotent and self-cleaning.** It recognizes our own hooks (by the `alert-hook` path or the `127.0.0.1:<port>/alert` URL), strips them from every event, then re-adds the current desired set — so running setup twice is a no-op, foreign hooks are preserved, and hooks for events we no longer use are removed. Preserve this property if you touch it.

**Line endings matter for shell scripts.** `.gitattributes` forces LF on `*.sh` and CRLF on `*.cmd`. A `.sh` script with CRLF endings fails on macOS/Linux with `bad interpreter`. Don't remove `.gitattributes`.
