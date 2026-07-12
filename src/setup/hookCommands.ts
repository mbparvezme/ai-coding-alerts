import { Os } from "../platform/Platform";

export type AlertKind = "popup" | "finished" | "activity";

export interface DesiredHook {
  event: string;
  matcher?: string;
  command: string;
}

const EVENTS: Array<{ event: string; matcher?: string; kind: AlertKind }> = [
  { event: "Notification", kind: "popup" },
  { event: "PermissionRequest", kind: "popup" },
  { event: "PreToolUse", matcher: "Bash|Write|Edit|NotebookEdit", kind: "popup" },
  { event: "PostToolUse", matcher: "Bash|Write|Edit|NotebookEdit", kind: "activity" },
  { event: "Stop", kind: "finished" }
];

export function hookCommand(os: Os, scriptsDir: string, kind: AlertKind): string {
  if (os === "win32") {
    return `cmd /c "${scriptsDir.replace(/\//g, "\\")}\\alert-hook.cmd" ${kind}`;
  }
  return `"${scriptsDir}/alert-hook.sh" ${kind}`;
}

export function desiredHooks(os: Os, scriptsDir: string): DesiredHook[] {
  return EVENTS.map(({ event, matcher, kind }) => ({
    event,
    matcher,
    command: hookCommand(os, scriptsDir, kind)
  }));
}
