import { TelegramUpdate } from "../platform/telegramApi";

export interface PollerDeps {
  getUpdates(offset: number, timeoutSec: number): Promise<TelegramUpdate[]>;
  chatId(): string;
  onCallback(cb: { callbackQueryId: string; data: string; chatId: string; messageId?: number }): void | Promise<void>;
  loadOffset(): number;
  saveOffset(n: number): void;
  isActive(): boolean;
  sleep?(ms: number): Promise<void>;
  longPollSec?: number;
}

const DEFAULT_LONG_POLL_SEC = 25;
const BACKOFF_MS = 3000;

export class TelegramPoller {
  private looping = false;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly deps: PollerDeps) {
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  get running(): boolean {
    return this.looping;
  }

  start(): void {
    if (this.looping) {
      return;
    }
    this.looping = true;
    void this.loop();
  }

  stop(): void {
    this.looping = false;
  }

  private async loop(): Promise<void> {
    while (this.looping && this.deps.isActive()) {
      try {
        const offset = this.deps.loadOffset();
        const updates = await this.deps.getUpdates(offset, this.deps.longPollSec ?? DEFAULT_LONG_POLL_SEC);
        for (const update of updates) {
          this.deps.saveOffset(update.update_id + 1);
          const cq = update.callback_query;
          if (!cq?.data || !cq.message) {
            continue;
          }
          if (String(cq.message.chat.id) !== this.deps.chatId()) {
            continue; // foreign chat — ignore but offset already advanced
          }
          await this.deps.onCallback({
            callbackQueryId: cq.id,
            data: cq.data,
            chatId: String(cq.message.chat.id),
            messageId: cq.message.message_id
          });
        }
      } catch {
        await this.sleep(BACKOFF_MS);
      }
    }
    this.looping = false;
  }
}
