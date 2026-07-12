import * as vscode from "vscode";
import { SoundChoices } from "./soundResolver";

const SECTION = "aiCodingAlerts";

export interface AlertSettings extends SoundChoices {
  port: number;
  popupAlertDelay: number;
  finishedAlertDelay: number;
  enableOsNotification: boolean;
  enableWindowFocus: boolean;
}

export class ConfigService {
  read(): AlertSettings {
    const config = vscode.workspace.getConfiguration(SECTION);
    return {
      port: config.get<number>("port", 51789),
      popupAlertDelay: config.get<number>("popupAlertDelay", 3),
      finishedAlertDelay: config.get<number>("finishedAlertDelay", 10),
      popup: {
        sound: config.get<string>("popupSound", "alarm"),
        customSoundPath: config.get<string>("popupCustomSoundPath", ""),
        enabled: config.get<boolean>("enablePopupSound", true)
      },
      finished: {
        sound: config.get<string>("finishedSound", "chime"),
        customSoundPath: config.get<string>("finishedCustomSoundPath", ""),
        enabled: config.get<boolean>("enableFinishedSound", true)
      },
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
