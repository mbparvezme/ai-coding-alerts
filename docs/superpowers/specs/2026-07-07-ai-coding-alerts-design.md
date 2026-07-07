# AI Coding Alerts — Design

VS Code extension that alerts developers when an AI coding agent (Claude Code, and future agents) is waiting for a permission confirmation. On alert it plays a sound, raises an OS-level notification, and focuses the VS Code window. It keeps an alert history and a stats dashboard in the sidebar.

Publisher: `mbparvezme`. Language: TypeScript, bundled with esbuild.

## Goals

- Notify reliably and cross-platform (macOS, Linux, Windows) the moment an agent starts waiting.
- Stay open to new agents: adding one must not touch the alert code.
- Ship a publishable, marketplace-ready extension with a documented setup path.

## Non-goals

- Automatically detecting whether the user approved or denied a prompt. Outcome is user-marked in v1.
- Bidirectional control of the agent. The extension only receives notifications.

## Architecture

One-directional pipe with a hard seam in the middle:

```
[Agent hooks] -> Ingress (HTTP server) -> DetectorRegistry -> AlertBus -> reactors
                                              (strategies)                 { SoundPlayer,
                                                                             OsNotifier,
                                                                             WindowFocuser,
                                                                             HistoryStore }
```

- **Ingress layer** owns a local HTTP server on the configured port. It knows nothing about agents or alerts; it receives POSTs and passes raw payloads to the detector registry. HTTP over the TCP port is used because a Claude Code hook can reach it with a single `curl` on every platform.
- **Detection layer** is a strategy abstraction. `AgentDetector` interface: `canHandle(payload)` and `parse(payload): Alert`. `DetectorRegistry` routes a payload to the first matching detector. `ClaudeCodeDetector` is the only implementation in v1. Adding an agent = one new detector class + one registration line.
- **Alert layer** receives a normalized `Alert` and fans it out to independent reactors through `AlertBus`. Each reactor reads its own settings and fails in isolation; the bus does not know reactor internals.

The seam is the normalized `Alert`. Detectors produce it; reactors consume it. Neither side references the other.

## Components

| Component | Responsibility | Depends on |
|---|---|---|
| `IngressServer` | HTTP listen/teardown on port; POST body -> registry | DetectorRegistry |
| `AgentDetector` (interface) | Recognize and normalize a payload | — |
| `ClaudeCodeDetector` | Parse Claude Code notification payloads into `Alert` | — |
| `DetectorRegistry` | Route payload to first matching detector | detectors |
| `AlertBus` | Fan out a normalized `Alert` to reactors | reactors |
| `SoundPlayer` | Play built-in/custom sound via per-OS audio player | audio command builder, child_process, config |
| `OsNotifier` | terminal-notifier / notify-send / BurntToast per OS | child_process, config |
| `WindowFocuser` | Bring the VS Code window to front | child_process, config |
| `HistoryStore` | Persist alerts, emit change events | injected key-value store |
| `StatsService` | Derive dashboard metrics from history | — |
| `HistoryViewProvider` | Sidebar webview: alert log + replay + mark status | HistoryStore |
| `DashboardViewProvider` | Sidebar webview: aggregate stats | StatsService |
| `ConfigService` | Typed access to settings + change events | vscode workspace config |

Playback, OS notification, and window focus all resolve to a per-OS `{ command, args }` built by a pure builder function and executed with a non-blocking, hidden-window `child_process.spawn` (never detached: a detached console process on Windows gets no console and PowerShell dies on startup). This keeps the platform branching in small, unit-testable builders and the side effect in a thin executor.

## Data model

```ts
interface Alert {
  id: string;
  agent: string;          // "claude-code"
  type: string;           // "permission" | "notification" | ...
  message: string;
  receivedAt: number;     // epoch ms
  status: 'pending' | 'approved' | 'denied';
  respondedAt?: number;   // set when the user marks it
}
```

## Data flow

1. Agent hook sends `POST /alert` with a JSON payload.
2. `IngressServer` reads the body and calls `DetectorRegistry.detect(payload)`.
3. The first detector whose `canHandle` returns true parses the payload into `Alert{ status: 'pending' }`.
4. `AlertBus.emit(alert)` fans out to `SoundPlayer`, `OsNotifier`, `WindowFocuser`, `HistoryStore`.
5. The user later clicks approve/deny in the History panel. `HistoryStore` sets `status` and `respondedAt`; History and Dashboard panels refresh via change events.

Derived metrics (`StatsService`): total alerts today, approved/denied counts, average response time over resolved alerts (`respondedAt - receivedAt`), peak alert hour, most common alert type.

## Sounds

- 3–4 short bundled WAV sounds in `media/sounds/`.
- Settings dropdown is an enum of built-in names plus a `custom` option. When `custom` is selected, `aiCodingAlerts.customSoundPath` supplies the file.
- `SoundPlayer` resolves the selected sound to an absolute path, builds a per-OS play command (macOS `afplay`; Linux `ffplay`/`paplay`/`aplay`; Windows PowerShell `MediaPlayer`), and runs it detached. History replay reuses the same resolution + command path.

## Settings (prefix `aiCodingAlerts.`)

| Key | Type | Default | Purpose |
|---|---|---|---|
| `port` | number | 51789 | Local HTTP/TCP port the ingress listens on |
| `sound` | enum + `custom` | first built-in | Selected alert sound |
| `customSoundPath` | string | "" | Absolute path used when `sound` is `custom` |
| `enableOsNotification` | boolean | true | Toggle OS-level notification reactor |
| `enableWindowFocus` | boolean | true | Toggle window-focus reactor |

Settings live-reload. Changing `port` restarts `IngressServer`.

## Error handling

- **Port in use**: status-bar warning + notification; extension stays alive, no crash.
- **Missing custom sound**: fall back to a default sound and show a one-time warning.
- **Missing OS notifier binary**: skip that reactor, log to the output channel; other reactors still run.
- **Reactor isolation**: one reactor throwing never blocks the others (each fan-out call is guarded).
- **Malformed payload / no matching detector**: respond 400/422, log, do not emit an alert.

## Testing

- **Unit** (mocha + thin vscode mock, no host): `ClaudeCodeDetector.parse`, `DetectorRegistry` routing, `StatsService` math, `HistoryStore` persistence.
- **Extension Dev Host**: launch config, then `curl` the port to exercise the full chain (sound + notification + focus + history + dashboard).
- **README**: documents the exact `curl` test command and the Claude Code `Notification` hook snippet.

## Deliverables

- Functional extension runnable in the Extension Development Host.
- `package.json` with all contribution points (views, view container, commands, configuration).
- README with setup instructions and the Claude Code `Notification` hook snippet.
- Marketplace-ready under publisher `mbparvezme`.
