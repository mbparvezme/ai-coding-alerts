import * as vscode from "vscode";
import { AlertSettings, readAlertSettings } from "./readAlertSettings";

export type { AlertSettings } from "./readAlertSettings";

const SECTION = "aiCodingAlerts";

export class ConfigService {
  read(): AlertSettings {
    const config = vscode.workspace.getConfiguration(SECTION);
    return readAlertSettings(<T>(key: string, fallback: T) => config.get<T>(key, fallback));
  }

  onDidChange(listener: () => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(SECTION)) {
        listener();
      }
    });
  }
}
