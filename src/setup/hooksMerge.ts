import { DesiredHook } from "./hookCommands";

interface HookEntry {
  type?: string;
  command?: string;
}

interface HookGroup {
  matcher?: string;
  hooks?: HookEntry[];
}

const OUR_COMMAND = /alert-hook\.(cmd|sh)|127\.0\.0\.1:\d+\/alert/;

function isOurs(entry: HookEntry): boolean {
  return entry.type === "command" && typeof entry.command === "string" && OUR_COMMAND.test(entry.command);
}

export function mergeHooks(
  settings: Record<string, unknown>,
  desired: DesiredHook[]
): { settings: Record<string, unknown>; changed: boolean } {
  const before = JSON.stringify(settings);
  const result = JSON.parse(before) as Record<string, unknown>;
  const hooks = (result.hooks ?? {}) as Record<string, HookGroup[]>;
  result.hooks = hooks;

  for (const { event, matcher, command } of desired) {
    const kept = (hooks[event] ?? [])
      .map((group) => ({ ...group, hooks: (group.hooks ?? []).filter((h) => !isOurs(h)) }))
      .filter((group) => group.hooks.length > 0);
    const ours: HookGroup = { hooks: [{ type: "command", command }] };
    if (matcher) {
      ours.matcher = matcher;
    }
    hooks[event] = [...kept, ours];
  }

  return { settings: result, changed: JSON.stringify(result) !== before };
}
