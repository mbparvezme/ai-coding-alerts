import { PendingDecisionStore } from "./PendingDecisionStore";
import { AllowRules, PermissionInfo } from "./AllowRules";
import { extractPermissionInfo } from "./permissionRequest";
import { parseCallback } from "./callbackData";
import { encodeCallback } from "./callbackData";
import { InlineButton, TelegramApi } from "../platform/telegramApi";
import { newId } from "../util/id";

export interface PermissionDeps {
  store: PendingDecisionStore;
  allowRules: AllowRules;
  api: () => TelegramApi;
  enabled: () => boolean;
  chatId: () => string;
  ttlMs: () => number;
  messageFor: (payload: unknown) => string;
  showPcPrompt: (text: string, resolve: (d: "allow" | "deny") => void) => () => void;
  muteFor: (ms: number) => void;
  muteMs: () => number;
  log: (msg: string) => void;
}

export interface PermissionSystem {
  create(payload: unknown): Promise<{ id: string }>;
  decision(id: string): { status: string };
  handleCallback(cb: { callbackQueryId: string; data: string }): Promise<void>;
}

function keyboard(id: string): InlineButton[][] {
  return [
    [
      { text: "✅ Approve", callback_data: encodeCallback(id, "approve") },
      { text: "⛔ Deny", callback_data: encodeCallback(id, "deny") }
    ],
    [
      { text: "✅ Approve & remember", callback_data: encodeCallback(id, "remember") },
      { text: "🔕 Mute", callback_data: encodeCallback(id, "mute") }
    ]
  ];
}

export function createPermissionSystem(deps: PermissionDeps): PermissionSystem {
  // Live pending context, keyed by decision id, needed by handleCallback.
  const context = new Map<string, { info: PermissionInfo | null; messageId?: number; dismissPc?: () => void; timer?: NodeJS.Timeout; done: boolean }>();

  const finish = async (id: string, outcome: string): Promise<void> => {
    const ctx = context.get(id);
    if (!ctx || ctx.done) {
      return;
    }
    ctx.done = true;
    if (ctx.timer !== undefined) {
      clearTimeout(ctx.timer);
    }
    try {
      ctx.dismissPc?.();
    } catch (e) {
      deps.log(`dismiss PC prompt failed: ${String(e)}`);
    }
    if (ctx.messageId !== undefined) {
      try {
        await deps.api().editMessageText(deps.chatId(), ctx.messageId, outcome);
      } catch (e) {
        deps.log(`edit message failed: ${String(e)}`);
      }
    }
    context.delete(id);
  };

  return {
    async create(payload) {
      if (!deps.enabled()) {
        return { id: newId() }; // not registered → poll reads "expired" → native dialog
      }
      const info = extractPermissionInfo(payload);
      if (info && deps.allowRules.matches(info)) {
        const id = deps.store.create(deps.ttlMs());
        deps.store.resolve(id, "allow");
        return { id }; // silent auto-approve, no send/prompt
      }
      const id = deps.store.create(deps.ttlMs());
      const text = deps.messageFor(payload);
      const ctx: { info: PermissionInfo | null; messageId?: number; dismissPc?: () => void; done: boolean } = { info, done: false };
      context.set(id, ctx);

      const off = deps.store.onChange(() => {
        const status = deps.store.status(id);
        if (status === "allow") { off(); void finish(id, `✅ ${text}\n\nApproved`); }
        else if (status === "deny") { off(); void finish(id, `⛔ ${text}\n\nDenied`); }
      });
      const timer = setTimeout(() => {
        if (deps.store.status(id) === "expired") { off(); void finish(id, `⏱ ${text}\n\nTimed out — answer on your computer`); }
      }, deps.ttlMs() + 1000);
      ctx.timer = timer;

      ctx.dismissPc = deps.showPcPrompt(text, (d) => deps.store.resolve(id, d));
      deps.api()
        .sendMessage(deps.chatId(), `🔔 Permission needed\n${text}`, keyboard(id))
        .then((res) => { ctx.messageId = res.message_id; })
        .catch((e) => deps.log(`send message failed: ${String(e)}`));

      return { id };
    },

    decision(id) {
      return { status: deps.store.status(id) };
    },

    async handleCallback({ callbackQueryId, data }) {
      const parsed = parseCallback(data);
      if (!parsed) {
        return;
      }
      const ctx = context.get(parsed.id);
      let note: string | undefined;
      switch (parsed.choice) {
        case "approve":
          if (!deps.store.resolve(parsed.id, "allow")) note = "Already handled";
          break;
        case "deny":
          if (!deps.store.resolve(parsed.id, "deny")) note = "Already handled";
          break;
        case "remember":
          if (ctx?.info) deps.allowRules.remember(ctx.info);
          if (!deps.store.resolve(parsed.id, "allow")) note = "Already handled";
          else note = "Will remember";
          break;
        case "mute":
          deps.muteFor(deps.muteMs());
          note = "Alerts muted";
          break;
      }
      try {
        await deps.api().answerCallbackQuery(callbackQueryId, note);
      } catch (e) {
        deps.log(`answerCallbackQuery failed: ${String(e)}`);
      }
    }
  };
}
