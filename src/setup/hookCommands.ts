import { Os } from "../platform/Platform";

export type AlertKind = "popup" | "finished" | "activity" | "permission";

export interface DesiredHook {
  event: string;
  matcher?: string;
  command: string;
}

const EVENTS: Array<{ event: string; matcher?: string; kind: AlertKind }> = [
  { event: "Notification", kind: "popup" },
  { event: "PermissionRequest", kind: "permission" },
  { event: "PostToolUse", matcher: "Bash|Write|Edit|NotebookEdit", kind: "activity" },
  { event: "Stop", kind: "finished" }
];

export function hookCommand(os: Os, scriptsDir: string, kind: AlertKind): string {
  const script = kind === "permission" ? "permission-hook" : "alert-hook";
  const arg = kind === "permission" ? "" : ` ${kind}`;
  if (os === "win32") {
    return `"${scriptsDir.replace(/\//g, "\\")}\\${script}.cmd"${arg}`;
  }
  return `"${scriptsDir}/${script}.sh"${arg}`;
}

export function desiredHooks(os: Os, scriptsDir: string): DesiredHook[] {
  return EVENTS.map(({ event, matcher, kind }) => ({
    event,
    matcher,
    command: hookCommand(os, scriptsDir, kind)
  }));
}
