import * as vscode from "vscode";
import { ConfigService } from "./config/ConfigService";
import { createAlert } from "./model/Alert";
import { resolveSoundPath, soundChoiceFor } from "./config/soundResolver";
import { HistoryStore } from "./history/HistoryStore";
import { DetectorRegistry } from "./detection/DetectorRegistry";
import { ClaudeCodeDetector } from "./detection/ClaudeCodeDetector";
import { AlertBus } from "./alert/AlertBus";
import { AlertScheduler } from "./alert/AlertScheduler";
import { MuteController } from "./alert/MuteController";
import { Escalator } from "./alert/Escalator";
import { IngressServer } from "./ingress/IngressServer";
import { candidatePorts } from "./ingress/portFallback";
import { SoundPlayer } from "./reactors/SoundPlayer";
import { OsNotifier } from "./reactors/OsNotifier";
import { WindowFocuser } from "./reactors/WindowFocuser";
import { TelegramNotifier } from "./reactors/TelegramNotifier";
import { sendTelegramMessage } from "./platform/telegramSend";
import { runCommand } from "./platform/runCommand";
import { currentOs } from "./platform/Platform";
import { HistoryPanel } from "./views/HistoryPanel";
import { DashboardPanel } from "./views/DashboardPanel";
import { HookInstaller } from "./setup/HookInstaller";
import { buildHealthReport } from "./health/healthReport";
import { createAccountService, registerAccountCommands } from "./license/wire";

const HOOKS_PROMPT_DISMISSED = "aiCodingAlerts.hooksPromptDismissed";
const HOOKS_GUIDE_URL = "https://github.com/mbparvezme/ai-coding-alerts#claude-code-hooks";

function installHooks(installer: HookInstaller): void {
  try {
    installer.install();
    vscode.window.showInformationMessage("AI Coding Alerts: Claude Code hooks are set up. New Claude Code sessions will send alerts here.");
  } catch (e) {
    vscode.window.showErrorMessage(`AI Coding Alerts: hook setup failed. ${String(e instanceof Error ? e.message : e)}`);
  }
}

async function offerHookSetup(installer: HookInstaller, state: vscode.Memento): Promise<void> {
  if (state.get(HOOKS_PROMPT_DISMISSED) || installer.status() !== "setup-needed") {
    return;
  }
  const choice = await vscode.window.showInformationMessage(
    "AI Coding Alerts needs Claude Code hooks to receive alerts. Set them up automatically?",
    "Set up",
    "Show instructions",
    "Don't ask again"
  );
  if (choice === "Set up") {
    installHooks(installer);
  } else if (choice === "Show instructions") {
    void vscode.env.openExternal(vscode.Uri.parse(HOOKS_GUIDE_URL));
  } else if (choice === "Don't ask again") {
    await state.update(HOOKS_PROMPT_DISMISSED, true);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("AI Coding Alerts");
  const config = new ConfigService();
  const history = new HistoryStore(context.globalState);
  const mute = new MuteController();
  const os = currentOs();
  const mediaRoot = context.extensionUri.fsPath.replace(/\\/g, "/") + "/media";

  const soundPlayer = new SoundPlayer(
    os,
    {
      resolvePath: (alertType) => {
        const choice = soundChoiceFor(alertType, config.read());
        return choice.enabled ? resolveSoundPath(choice, mediaRoot) : null;
      }
    },
    runCommand,
    () => mute.isMuted()
  );
  const bus = new AlertBus(
    [
      soundPlayer,
      new OsNotifier(os, () => !mute.isMuted() && config.read().enableOsNotification, runCommand),
      new WindowFocuser(os, () => !mute.isMuted() && config.read().enableWindowFocus, runCommand),
      new TelegramNotifier(() => config.read().telegram, sendTelegramMessage, () => mute.isMuted()),
      { react: (alert) => history.add(alert) }
    ],
    (_r, e) => output.appendLine(`Reactor error: ${String(e)}`)
  );

  const registry = new DetectorRegistry([new ClaudeCodeDetector()]);

  let configuredPort = config.read().port;
  let activePort = configuredPort;

  const installer = new HookInstaller(os, context.extensionUri.fsPath, () => activePort);
  const refreshScripts = (): void => {
    try {
      installer.refreshScripts();
    } catch (e) {
      output.appendLine(`Hook script refresh failed: ${String(e)}`);
    }
  };
  refreshScripts();
  void offerHookSetup(installer, context.globalState);

  const escalator = new Escalator({
    repeatMs: () => config.read().escalationInterval * 1000,
    maxRepeats: () => config.read().escalationRepeats
  });

  const scheduler = new AlertScheduler(
    {
      popupMs: () => config.read().popupAlertDelay * 1000,
      finishedMs: () => config.read().finishedAlertDelay * 1000
    },
    (alert) => {
      void bus.emit(alert);
      if (alert.type === "permission" || alert.type === "notification") {
        escalator.begin(() => {
          if (!mute.isMuted()) {
            soundPlayer.play(alert.type);
          }
        });
      }
    }
  );

  const handlePayload = (payload: unknown): void => {
    const alert = registry.detect(payload);
    if (alert) {
      escalator.cancel();
      scheduler.push(alert);
    } else {
      output.appendLine(`Ignored unrecognized payload: ${JSON.stringify(payload)}`);
    }
  };

  let server = new IngressServer(handlePayload);
  const startServer = async (): Promise<void> => {
    for (const candidate of candidatePorts(configuredPort)) {
      try {
        await server.start(candidate);
        activePort = candidate;
        output.appendLine(`Listening on 127.0.0.1:${candidate}`);
        if (candidate !== configuredPort) {
          vscode.window.showWarningMessage(
            `AI Coding Alerts: port ${configuredPort} was busy; listening on ${candidate} instead. Hooks were updated to match.`
          );
        }
        refreshScripts();
        return;
      } catch {
        // port busy — try the next candidate
      }
    }
    vscode.window.showWarningMessage(`AI Coding Alerts: no free port found near ${configuredPort}. Change aiCodingAlerts.port.`);
  };
  void startServer();

  const muteStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  muteStatus.command = "aiCodingAlerts.toggleMute";
  let muteTimer: NodeJS.Timeout | undefined;
  const updateMuteStatus = (): void => {
    const muted = mute.isMuted();
    muteStatus.text = muted ? "$(bell-slash) Alerts muted" : "$(bell) Alerts";
    muteStatus.tooltip = muted
      ? "AI Coding Alerts are muted — click to change"
      : "AI Coding Alerts are active — click to snooze or mute";
  };
  updateMuteStatus();
  muteStatus.show();

  const account = createAccountService(context);
  registerAccountCommands(context, account);
  void account
    .init()
    .then(() => { void account.recheckIfNewDay(); }) // fire-and-forget; never blocks activation
    .catch((e) => output.appendLine(`Account init skipped: ${String(e)}`));

  context.subscriptions.push(
    output,
    muteStatus,
    vscode.commands.registerCommand("aiCodingAlerts.toggleMute", async () => {
      const items: Array<vscode.QuickPickItem & { ms: number }> = [];
      if (mute.isMuted()) {
        items.push({ label: "$(bell) Unmute now", ms: 0 });
      }
      items.push(
        { label: "$(bell-slash) Snooze 15 minutes", ms: 15 * 60 * 1000 },
        { label: "$(bell-slash) Snooze 30 minutes", ms: 30 * 60 * 1000 },
        { label: "$(bell-slash) Snooze 1 hour", ms: 60 * 60 * 1000 },
        { label: "$(bell-slash) Mute until I turn it back on", ms: Number.POSITIVE_INFINITY }
      );
      const pick = await vscode.window.showQuickPick(items, { placeHolder: "AI Coding Alerts" });
      if (!pick) {
        return;
      }
      if (muteTimer) {
        clearTimeout(muteTimer);
        muteTimer = undefined;
      }
      if (pick.ms === 0) {
        mute.unmute();
      } else if (pick.ms === Number.POSITIVE_INFINITY) {
        mute.muteIndefinitely();
      } else {
        mute.muteFor(pick.ms);
        muteTimer = setTimeout(updateMuteStatus, pick.ms);
      }
      updateMuteStatus();
    }),
    vscode.commands.registerCommand("aiCodingAlerts.openHistory", () =>
      HistoryPanel.show(context.extensionUri, history, (alertType) => soundPlayer.play(alertType))
    ),
    vscode.commands.registerCommand("aiCodingAlerts.openDashboard", () =>
      DashboardPanel.show(context.extensionUri, history)
    ),
    vscode.commands.registerCommand("aiCodingAlerts.clearHistory", () => history.clear()),
    vscode.commands.registerCommand("aiCodingAlerts.installHooks", () => installHooks(installer)),
    vscode.commands.registerCommand("aiCodingAlerts.testAlert", () =>
      void bus.emit(createAlert({ agent: "claude-code", type: "notification", message: "Test alert" }))
    ),
    vscode.commands.registerCommand("aiCodingAlerts.healthCheck", async () => {
      const report = buildHealthReport({
        listening: server.port() !== 0,
        port: activePort,
        hooksStatus: installer.status(),
        scriptsDeployed: installer.deployed()
      });
      output.appendLine("Health check:");
      report.lines.forEach((line) => output.appendLine(`  ${line}`));
      const actions = report.ok ? ["Send Test Alert"] : ["Install Hooks", "Send Test Alert"];
      const choice = await vscode.window.showInformationMessage(
        report.ok ? "AI Coding Alerts: all systems go." : "AI Coding Alerts: some checks need attention.",
        { modal: true, detail: report.lines.join("\n") },
        ...actions
      );
      if (choice === "Install Hooks") {
        installHooks(installer);
      } else if (choice === "Send Test Alert") {
        void bus.emit(createAlert({ agent: "claude-code", type: "notification", message: "Test alert" }));
      }
    }),
    config.onDidChange(async () => {
      const nextPort = config.read().port;
      if (nextPort === configuredPort) {
        return;
      }
      configuredPort = nextPort;
      await server.stop();
      server = new IngressServer(handlePayload);
      await startServer();
    }),
    { dispose: () => void server.stop() }
  );
}

export function deactivate(): void {}
