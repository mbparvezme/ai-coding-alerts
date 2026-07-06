import { Alert, createAlert } from "../model/Alert";
import { AgentDetector } from "./AgentDetector";

interface ClaudeNotification {
  hook_event_name: string;
  message?: string;
}

function isClaudeNotification(payload: unknown): payload is ClaudeNotification {
  return (
    typeof payload === "object" &&
    payload !== null &&
    (payload as { hook_event_name?: unknown }).hook_event_name === "Notification"
  );
}

export class ClaudeCodeDetector implements AgentDetector {
  readonly agent = "claude-code";

  canHandle(payload: unknown): boolean {
    return isClaudeNotification(payload);
  }

  parse(payload: unknown): Alert {
    const message = isClaudeNotification(payload) && payload.message
      ? payload.message
      : "Claude Code needs your attention";
    return createAlert({ agent: this.agent, type: "notification", message });
  }
}
