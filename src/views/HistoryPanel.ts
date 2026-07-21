import * as vscode from "vscode";
import { HistoryStore } from "../history/HistoryStore";
import { panelHtml } from "./webviewHtml";

export class HistoryPanel {
  static readonly viewType = "aiCodingAlerts.history";
  private static current: HistoryPanel | undefined;

  static show(extensionUri: vscode.Uri, history: HistoryStore, onReplay: (alertType: string) => void): void {
    if (HistoryPanel.current) {
      HistoryPanel.current.panel.reveal();
      return;
    }
    HistoryPanel.current = new HistoryPanel(extensionUri, history, onReplay);
  }

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(
    extensionUri: vscode.Uri,
    private readonly history: HistoryStore,
    private readonly onReplay: (alertType: string) => void
  ) {
    this.panel = vscode.window.createWebviewPanel(HistoryPanel.viewType, "Alert History", vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [extensionUri]
    });
    this.panel.webview.html = panelHtml({
      webview: this.panel.webview,
      extensionUri,
      script: "history.js",
      title: "Alert History"
    });
    this.panel.webview.onDidReceiveMessage((msg) => this.handle(msg), undefined, this.disposables);
    this.disposables.push(this.history.onDidChange(() => this.push()));
    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
  }

  private handle(msg: { type: string; id?: string }): void {
    if (msg.type === "ready") {
      this.push();
    } else if (msg.type === "approve" && msg.id) {
      this.history.setStatus(msg.id, "approved");
    } else if (msg.type === "deny" && msg.id) {
      this.history.setStatus(msg.id, "denied");
    } else if (msg.type === "replay") {
      const alert = this.history.list().find((a) => a.id === msg.id);
      this.onReplay(alert?.type ?? "permission");
    }
  }

  private push(): void {
    void this.panel.webview.postMessage({ type: "data", alerts: this.history.list() });
  }

  private dispose(): void {
    HistoryPanel.current = undefined;
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}
