import { Command, Os } from "./Platform";

function escapeSingleQuotes(value: string): string {
  return value.replace(/'/g, "''");
}

export function buildNotifyCommand(os: Os, title: string, message: string): Command {
  if (os === "darwin") {
    return { command: "terminal-notifier", args: ["-title", title, "-message", message] };
  }
  if (os === "linux") {
    return { command: "notify-send", args: ["-u", "critical", title, message] };
  }
  const script = `New-BurntToastNotification -Text '${escapeSingleQuotes(title)}','${escapeSingleQuotes(message)}'`;
  return { command: "powershell", args: ["-NoProfile", "-Command", script] };
}
