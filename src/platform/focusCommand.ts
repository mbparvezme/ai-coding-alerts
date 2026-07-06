import { Command, Os } from "./Platform";

export function buildFocusCommand(os: Os): Command | null {
  if (os === "darwin") {
    return { command: "osascript", args: ["-e", 'tell application "Visual Studio Code" to activate'] };
  }
  if (os === "linux") {
    return { command: "wmctrl", args: ["-a", "Visual Studio Code"] };
  }
  const script =
    `$w = New-Object -ComObject WScript.Shell; ` +
    `$w.AppActivate('Visual Studio Code') | Out-Null`;
  return { command: "powershell", args: ["-NoProfile", "-Command", script] };
}
