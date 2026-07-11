import { Alert, createAlert } from "../model/Alert";
import { AgentDetector } from "./AgentDetector";

interface ClaudeHookPayload {
  hook_event_name: string;
  message?: string;
  last_assistant_message?: string;
  tool_name?: string;
  tool_input?: { command?: string; description?: string };
}

const HANDLED_EVENTS = new Set(["Notification", "Stop", "PreToolUse"]);
const MAX_MESSAGE_LENGTH = 140;

function asClaudePayload(payload: unknown): ClaudeHookPayload | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const event = (payload as { hook_event_name?: unknown }).hook_event_name;
  return typeof event === "string" && HANDLED_EVENTS.has(event)
    ? (payload as ClaudeHookPayload)
    : null;
}

function truncate(text: string): string {
  return text.length > MAX_MESSAGE_LENGTH ? text.slice(0, MAX_MESSAGE_LENGTH - 1) + "…" : text;
}

export class ClaudeCodeDetector implements AgentDetector {
  readonly agent = "claude-code";

  canHandle(payload: unknown): boolean {
    return asClaudePayload(payload) !== null;
  }

  parse(payload: unknown): Alert {
    const claude = asClaudePayload(payload);
    if (claude?.hook_event_name === "PreToolUse") {
      const detail = claude.tool_input?.description?.trim() || claude.tool_input?.command?.trim();
      const tool = claude.tool_name ?? "a tool";
      const message = truncate(detail ? `${tool}: ${detail}` : `Claude Code wants to use ${tool}`);
      return createAlert({ agent: this.agent, type: "permission", message });
    }
    if (claude?.hook_event_name === "Stop") {
      const message = claude.last_assistant_message?.trim()
        ? truncate(claude.last_assistant_message.trim())
        : "Claude Code finished responding";
      return createAlert({ agent: this.agent, type: "completion", message });
    }
    const message = claude?.message ? claude.message : "Claude Code needs your attention";
    return createAlert({ agent: this.agent, type: "notification", message });
  }
}
