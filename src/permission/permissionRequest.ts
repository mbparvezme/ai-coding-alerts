import { PermissionInfo } from "./AllowRules";

interface RawPermission {
  hook_event_name?: unknown;
  tool_name?: unknown;
  tool_input?: { command?: unknown; description?: unknown };
}

export function extractPermissionInfo(payload: unknown): PermissionInfo | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const p = payload as RawPermission;
  if (p.hook_event_name !== "PermissionRequest") {
    return null;
  }
  const tool = typeof p.tool_name === "string" ? p.tool_name : "a tool";
  const command =
    (typeof p.tool_input?.command === "string" && p.tool_input.command.trim()) ||
    (typeof p.tool_input?.description === "string" && p.tool_input.description.trim()) ||
    "";
  return { agent: "claude-code", tool, command };
}
