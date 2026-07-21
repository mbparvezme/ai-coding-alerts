import * as vscode from "vscode";
import { HistoryStore } from "../history/HistoryStore";
import { computeStats } from "../stats/StatsService";
import { panelHtml } from "./webviewHtml";

export class DashboardPanel {
  static readonly viewType = "aiCodingAlerts.dashboard";
  private static current: DashboardPanel | undefined;

  static show(extensionUri: vscode.Uri, history: HistoryStore): void {
    if (DashboardPanel.current) {
      DashboardPanel.current.panel.reveal();
      return;
    }
    DashboardPanel.current = new DashboardPanel(extensionUri, history);
  }

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(
    extensionUri: vscode.Uri,
    private readonly history: HistoryStore
  ) {
    this.panel = vscode.window.createWebviewPanel(DashboardPanel.viewType, "Dashboard", vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [extensionUri]
    });
    this.panel.webview.html = panelHtml({
      webview: this.panel.webview,
      extensionUri,
      script: "dashboard.js",
      title: "Dashboard"
    });
    this.panel.webview.onDidReceiveMessage((msg) => this.handle(msg), undefined, this.disposables);
    this.disposables.push(this.history.onDidChange(() => this.push()));
    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
  }

  private handle(msg: { type: string }): void {
    if (msg.type === "ready") {
      this.push();
    }
  }

  private push(): void {
    void this.panel.webview.postMessage({ type: "stats", stats: computeStats(this.history.list()) });
  }

  private dispose(): void {
    DashboardPanel.current = undefined;
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}
