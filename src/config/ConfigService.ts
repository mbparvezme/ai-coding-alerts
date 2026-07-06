import * as vscode from "vscode";

const SECTION = "aiCodingAlerts";

export interface AlertSettings {
  port: number;
  sound: string;
  customSoundPath: string;
  enableOsNotification: boolean;
  enableWindowFocus: boolean;
}

export class ConfigService {
  read(): AlertSettings {
    const config = vscode.workspace.getConfiguration(SECTION);
    return {
      port: config.get<number>("port", 51789),
      sound: config.get<string>("sound", "chime"),
      customSoundPath: config.get<string>("customSoundPath", ""),
      enableOsNotification: config.get<boolean>("enableOsNotification", true),
      enableWindowFocus: config.get<boolean>("enableWindowFocus", true)
    };
  }

  onDidChange(listener: () => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(SECTION)) {
        listener();
      }
    });
  }
}
