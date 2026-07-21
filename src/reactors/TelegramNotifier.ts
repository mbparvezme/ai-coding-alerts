import { Alert } from "../model/Alert";
import { Reactor } from "../alert/Reactor";

export interface TelegramSettings {
  enabled: boolean;
  botToken: string;
  chatId: string;
}

export type TelegramSender = (botToken: string, chatId: string, text: string) => void | Promise<void>;

const LABELS: Record<string, string> = {
  permission: "🔔 Permission needed",
  notification: "🔔 Needs your attention",
  completion: "✅ Finished"
};

export function formatTelegramMessage(alert: Alert): string {
  const label = LABELS[alert.type] ?? "🔔 Alert";
  return `${label}\n${alert.message}`;
}

export class TelegramNotifier implements Reactor {
  constructor(
    private readonly settings: () => TelegramSettings,
    private readonly send: TelegramSender,
    private readonly muted: () => boolean = () => false
  ) {}

  async react(alert: Alert): Promise<void> {
    if (this.muted()) {
      return;
    }
    const { enabled, botToken, chatId } = this.settings();
    if (!enabled || !botToken.trim() || !chatId.trim()) {
      return;
    }
    await this.send(botToken.trim(), chatId.trim(), formatTelegramMessage(alert));
  }
}
