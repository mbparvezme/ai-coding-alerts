import { HookStatus } from "../setup/HookInstaller";

export interface HealthFacts {
  listening: boolean;
  port: number;
  hooksStatus: HookStatus;
  scriptsDeployed: boolean;
}

export interface HealthReport {
  ok: boolean;
  lines: string[];
}

export function buildHealthReport(facts: HealthFacts): HealthReport {
  const lines: string[] = [];

  lines.push(
    facts.listening
      ? `✓ Listening for alerts on 127.0.0.1:${facts.port}`
      : "✗ Not listening — no free port was available"
  );

  if (facts.hooksStatus === "current") {
    lines.push("✓ Claude Code hooks are registered");
  } else if (facts.hooksStatus === "setup-needed") {
    lines.push("✗ Claude Code hooks are not set up — run 'Install Claude Code Hooks'");
  } else {
    lines.push("⚠ Claude Code settings file could not be read — fix or remove it, then reinstall hooks");
  }

  lines.push(
    facts.scriptsDeployed
      ? "✓ Alert scripts are deployed (alerts work even when VS Code is closed)"
      : "⚠ Alert scripts are not deployed — run 'Install Claude Code Hooks' for closed-VS-Code alerts"
  );

  return { ok: facts.listening && facts.hooksStatus === "current", lines };
}
