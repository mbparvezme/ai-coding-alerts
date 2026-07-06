import { spawn } from "node:child_process";
import { Command } from "./Platform";

export function runCommand(command: Command): void {
  const child = spawn(command.command, command.args, {
    detached: true,
    stdio: "ignore"
  });
  child.on("error", () => {});
  child.unref();
}
