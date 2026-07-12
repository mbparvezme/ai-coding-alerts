import * as vscode from "vscode";
import { ConfigService } from "./config/ConfigService";
import { resolveSoundPath, soundChoiceFor } from "./config/soundResolver";
import { HistoryStore } from "./history/HistoryStore";
import { DetectorRegistry } from "./detection/DetectorRegistry";
import { ClaudeCodeDetector } from "./detection/ClaudeCodeDetector";
import { AlertBus } from "./alert/AlertBus";
import { IngressServer } from "./ingress/IngressServer";
import { SoundPlayer } from "./reactors/SoundPlayer";
import { OsNotifier } from "./reactors/OsNotifier";
import { WindowFocuser } from "./reactors/WindowFocuser";
import { runCommand } from "./platform/runCommand";
import { currentOs } from "./platform/Platform";
import { HistoryViewProvider } from "./views/HistoryViewProvider";
import { DashboardViewProvider } from "./views/DashboardViewProvider";
import { HookInstaller } from "./setup/HookInstaller";

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
    runCommand
  );
  const bus = new AlertBus(
    [
      soundPlayer,
      new OsNotifier(os, () => config.read().enableOsNotification, runCommand),
      new WindowFocuser(os, () => config.read().enableWindowFocus, runCommand),
      { react: (alert) => history.add(alert) }
    ],
    (_r, e) => output.appendLine(`Reactor error: ${String(e)}`)
  );

  const registry = new DetectorRegistry([new ClaudeCodeDetector()]);

  const installer = new HookInstaller(os, context.extensionUri.fsPath, () => config.read().port);
  try {
    installer.refreshScripts();
  } catch (e) {
    output.appendLine(`Hook script refresh failed: ${String(e)}`);
  }
  void offerHookSetup(installer, context.globalState);

  const handlePayload = (payload: unknown): void => {
    const alert = registry.detect(payload);
    if (alert) {
      void bus.emit(alert);
    } else {
      output.appendLine(`Ignored unrecognized payload: ${JSON.stringify(payload)}`);
    }
  };

  let server = new IngressServer(handlePayload);
  const startServer = async (): Promise<void> => {
    const { port } = config.read();
    try {
      await server.start(port);
      output.appendLine(`Listening on 127.0.0.1:${port}`);
    } catch {
      vscode.window.showWarningMessage(`AI Coding Alerts: port ${port} is unavailable. Change aiCodingAlerts.port.`);
    }
  };
  void startServer();

  const historyView = new HistoryViewProvider(context.extensionUri, history, (alertType) => soundPlayer.play(alertType));
  const dashboardView = new DashboardViewProvider(context.extensionUri, history);

  context.subscriptions.push(
    output,
    vscode.window.registerWebviewViewProvider(HistoryViewProvider.viewId, historyView),
    vscode.window.registerWebviewViewProvider(DashboardViewProvider.viewId, dashboardView),
    vscode.commands.registerCommand("aiCodingAlerts.clearHistory", () => history.clear()),
    vscode.commands.registerCommand("aiCodingAlerts.installHooks", () => installHooks(installer)),
    vscode.commands.registerCommand("aiCodingAlerts.testAlert", () =>
      handlePayload({ hook_event_name: "Notification", message: "Test alert" })
    ),
    config.onDidChange(async () => {
      await server.stop();
      server = new IngressServer(handlePayload);
      await startServer();
      try {
        installer.refreshScripts();
      } catch (e) {
        output.appendLine(`Hook script refresh failed: ${String(e)}`);
      }
    }),
    { dispose: () => void server.stop() }
  );
}

export function deactivate(): void {}
