import { SoundChoices } from "./soundResolver";

export interface AlertSettings extends SoundChoices {
  port: number;
  popupAlertDelay: number;
  finishedAlertDelay: number;
  enableOsNotification: boolean;
  enableWindowFocus: boolean;
  telegram: { enabled: boolean; botToken: string; chatId: string; twoWay: boolean };
  permissionTimeoutSec: number;
  telegramMuteMinutes: number;
  escalationRepeats: number;
  escalationInterval: number;
}

export type Getter = <T>(key: string, fallback: T) => T;

export function readAlertSettings(get: Getter): AlertSettings {
  return {
    port: get("port", 51789),
    popupAlertDelay: get("popupAlertDelay", 3),
    finishedAlertDelay: get("finishedAlertDelay", 10),
    popup: { sound: get("popupSound", "alarm"), customSoundPath: get("popupCustomSoundPath", ""), enabled: get("enablePopupSound", true) },
    finished: { sound: get("finishedSound", "chime"), customSoundPath: get("finishedCustomSoundPath", ""), enabled: get("enableFinishedSound", true) },
    enableOsNotification: get("enableOsNotification", true),
    enableWindowFocus: get("enableWindowFocus", true),
    telegram: {
      enabled: get("enableTelegramPush", false),
      botToken: get("telegramBotToken", ""),
      chatId: get("telegramChatId", ""),
      twoWay: get("enableTelegramTwoWay", true)
    },
    permissionTimeoutSec: get("permissionTimeoutSec", 300),
    telegramMuteMinutes: get("telegramMuteMinutes", 480),
    escalationRepeats: get("escalationRepeats", 3),
    escalationInterval: get("escalationInterval", 30)
  };
}
