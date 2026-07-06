import { Command, Os } from "./Platform";

export function buildSoundCommand(os: Os, filePath: string): Command {
  if (os === "darwin") {
    return { command: "afplay", args: [filePath] };
  }
  if (os === "linux") {
    return { command: "ffplay", args: ["-nodisp", "-autoexit", "-loglevel", "quiet", filePath] };
  }
  const script =
    `Add-Type -AssemblyName presentationCore; ` +
    `$p = New-Object System.Windows.Media.MediaPlayer; ` +
    `$p.Open([uri]'${filePath}'); $p.Play(); Start-Sleep -Seconds 5`;
  return { command: "powershell", args: ["-NoProfile", "-STA", "-Command", script] };
}
