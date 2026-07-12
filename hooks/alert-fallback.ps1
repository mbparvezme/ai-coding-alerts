param([string]$Kind = "popup")

$sounds = @{
  popup    = "alarm.wav"
  finished = "chime.wav"
}

$messages = @{
  popup    = "Claude Code is waiting for your decision"
  finished = "Claude Code finished responding"
}

if (-not $sounds.ContainsKey($Kind)) { exit 0 }

$dir = Join-Path $PSScriptRoot "sounds"
if (-not (Test-Path $dir)) {
  $dir = Join-Path (Split-Path -Parent $PSScriptRoot) "media\sounds"
}
$file = Join-Path $dir $sounds[$Kind]
if (-not (Test-Path $file)) { exit 0 }

if ([IO.Path]::GetExtension($file) -eq ".wav") {
  (New-Object System.Media.SoundPlayer $file).PlaySync()
} else {
  Add-Type -Name Mci -Namespace Win32 -MemberDefinition '[DllImport("winmm.dll")] public static extern int mciSendString(string cmd, System.Text.StringBuilder ret, int retLen, IntPtr cb);'
  [Win32.Mci]::mciSendString("open `"$file`" type mpegvideo alias snd", $null, 0, [IntPtr]::Zero) | Out-Null
  [Win32.Mci]::mciSendString("play snd wait", $null, 0, [IntPtr]::Zero) | Out-Null
  [Win32.Mci]::mciSendString("close snd", $null, 0, [IntPtr]::Zero) | Out-Null
}

if (Get-Module -ListAvailable -Name BurntToast) {
  New-BurntToastNotification -Text "AI Coding Alerts", $messages[$Kind]
}
