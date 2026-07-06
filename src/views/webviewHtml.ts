import * as vscode from "vscode";

export function nonce(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function panelHtml(opts: {
  webview: vscode.Webview;
  extensionUri: vscode.Uri;
  script: string;
  title: string;
}): string {
  const { webview, extensionUri, script, title } = opts;
  const n = nonce();
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", script));
  const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "panel.css"));
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${n}';" />
<link href="${cssUri}" rel="stylesheet" />
<title>${title}</title>
</head>
<body>
<div id="root"></div>
<script nonce="${n}" src="${scriptUri}"></script>
</body>
</html>`;
}
