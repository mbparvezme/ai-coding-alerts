import { Command, Os } from "./Platform";

function encodedPowershell(script: string): Command {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return { command: "powershell", args: ["-NoProfile", "-EncodedCommand", encoded] };
}

export function buildSoundCommand(os: Os, filePath: string): Command {
  if (os === "darwin") {
    return { command: "afplay", args: [filePath] };
  }
  if (os === "linux") {
    return { command: "ffplay", args: ["-nodisp", "-autoexit", "-loglevel", "quiet", filePath] };
  }
  const script = filePath.toLowerCase().endsWith(".wav")
    ? `(New-Object System.Media.SoundPlayer '${filePath}').PlaySync()`
    : `Add-Type -Name Mci -Namespace Win -MemberDefinition ` +
      `'[DllImport("winmm.dll")] public static extern int mciSendString(string c, System.Text.StringBuilder r, int n, System.IntPtr cb);'; ` +
      `[Win.Mci]::mciSendString('open "${filePath}" type mpegvideo alias snd', $null, 0, [IntPtr]::Zero); ` +
      `[Win.Mci]::mciSendString('play snd wait', $null, 0, [IntPtr]::Zero); ` +
      `[Win.Mci]::mciSendString('close snd', $null, 0, [IntPtr]::Zero)`;
  return encodedPowershell(script);
}
