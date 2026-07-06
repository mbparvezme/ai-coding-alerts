import * as vscode from "vscode";
import { HistoryStore } from "../history/HistoryStore";
import { computeStats } from "../stats/StatsService";
import { panelHtml } from "./webviewHtml";

export class DashboardViewProvider implements vscode.WebviewViewProvider {
  static readonly viewId = "aiCodingAlerts.dashboard";

  private view: vscode.WebviewView | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly history: HistoryStore
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
    view.webview.html = panelHtml({
      webview: view.webview,
      extensionUri: this.extensionUri,
      script: "dashboard.js",
      title: "Dashboard"
    });
    this.history.onDidChange(() => this.push());
    this.push();
  }

  private push(): void {
    this.view?.webview.postMessage({ type: "stats", stats: computeStats(this.history.list()) });
  }
}
