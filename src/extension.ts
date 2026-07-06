import * as vscode from "vscode";

let output: vscode.OutputChannel;

export function activate(_context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel("AI Coding Alerts");
  output.appendLine("AI Coding Alerts activated");
}

export function deactivate(): void {
  output?.dispose();
}
