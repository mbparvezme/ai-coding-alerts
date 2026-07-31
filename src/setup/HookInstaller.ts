import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Os } from "../platform/Platform";
import { desiredHooks } from "./hookCommands";
import { mergeHooks } from "./hooksMerge";

const SCRIPTS = [
  "alert-hook.cmd", "alert-fallback.ps1", "alert-hook.sh", "alert-fallback.sh",
  "permission-hook.cmd", "permission-hook.ps1", "permission-hook.sh"
];
const DEFAULT_PORT = "51789";

export type HookStatus = "current" | "setup-needed" | "unreadable";

export class HookInstaller {
  readonly scriptsDir = path.join(os.homedir(), ".ai-coding-alerts");
  readonly settingsPath = path.join(os.homedir(), ".claude", "settings.json");

  constructor(
    private readonly platform: Os,
    private readonly extensionRoot: string,
    private readonly port: () => number
  ) {}

  status(): HookStatus {
    const settings = this.readSettings();
    if (settings === null) {
      return "unreadable";
    }
    return mergeHooks(settings, desiredHooks(this.platform, this.scriptsDir)).changed
      ? "setup-needed"
      : "current";
  }

  deployed(): boolean {
    return fs.existsSync(this.scriptsDir);
  }

  install(): void {
    const settings = this.readSettings();
    if (settings === null) {
      throw new Error(`Could not parse ${this.settingsPath}. Fix or remove it and retry.`);
    }
    this.deployScripts();
    const merged = mergeHooks(settings, desiredHooks(this.platform, this.scriptsDir));
    if (!merged.changed) {
      return;
    }
    if (fs.existsSync(this.settingsPath)) {
      fs.copyFileSync(this.settingsPath, this.settingsPath + ".backup");
    } else {
      fs.mkdirSync(path.dirname(this.settingsPath), { recursive: true });
    }
    fs.writeFileSync(this.settingsPath, JSON.stringify(merged.settings, null, 2) + "\n");
  }

  refreshScripts(): void {
    if (this.deployed()) {
      this.deployScripts();
    }
  }

  private deployScripts(): void {
    const soundsDir = path.join(this.scriptsDir, "sounds");
    fs.mkdirSync(soundsDir, { recursive: true });
    for (const name of SCRIPTS) {
      const source = path.join(this.extensionRoot, "hooks", name);
      const target = path.join(this.scriptsDir, name);
      const content = fs.readFileSync(source, "utf8").replace(DEFAULT_PORT, String(this.port()));
      fs.writeFileSync(target, content);
      if (name.endsWith(".sh")) {
        fs.chmodSync(target, 0o755);
      }
    }
    const mediaSounds = path.join(this.extensionRoot, "media", "sounds");
    for (const file of fs.readdirSync(mediaSounds)) {
      fs.copyFileSync(path.join(mediaSounds, file), path.join(soundsDir, file));
    }
  }

  private readSettings(): Record<string, unknown> | null {
    if (!fs.existsSync(this.settingsPath)) {
      return {};
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.settingsPath, "utf8"));
      return typeof parsed === "object" && parsed !== null ? parsed : null;
    } catch {
      return null;
    }
  }
}
