import * as vscode from "vscode";
import { HistoryStore } from "../history/HistoryStore";
import { panelHtml } from "./webviewHtml";

export class HistoryViewProvider implements vscode.WebviewViewProvider {
  static readonly viewId = "aiCodingAlerts.history";

  private view: vscode.WebviewView | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly history: HistoryStore,
    private readonly onReplay: (alertType: string) => void
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
    view.webview.html = panelHtml({
      webview: view.webview,
      extensionUri: this.extensionUri,
      script: "history.js",
      title: "Alert History"
    });
    view.webview.onDidReceiveMessage((msg) => this.handle(msg));
    this.history.onDidChange(() => this.push());
    this.push();
  }

  private handle(msg: { type: string; id?: string }): void {
    if (msg.type === "approve" && msg.id) {
      this.history.setStatus(msg.id, "approved");
    } else if (msg.type === "deny" && msg.id) {
      this.history.setStatus(msg.id, "denied");
    } else if (msg.type === "replay") {
      const alert = this.history.list().find((a) => a.id === msg.id);
      this.onReplay(alert?.type ?? "permission");
    }
  }

  private push(): void {
    this.view?.webview.postMessage({ type: "data", alerts: this.history.list() });
  }
}
