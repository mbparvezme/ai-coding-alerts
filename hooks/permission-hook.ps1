$ErrorActionPreference = "Stop"
$port = if ($env:AICA_PORT) { $env:AICA_PORT } else { "51789" }
$base = "http://127.0.0.1:$port"
$payload = [Console]::In.ReadToEnd()
try {
  $res = Invoke-RestMethod -Uri "$base/permission" -Method Post -ContentType "application/json" -Body $payload -TimeoutSec 5
  $id = $res.id
} catch { exit 0 }
if (-not $id) { exit 0 }
for ($i = 0; $i -lt 160; $i++) {
  try { $d = Invoke-RestMethod -Uri "$base/decision/$id" -TimeoutSec 10 } catch { exit 0 }
  switch ($d.status) {
    "allow"   { Write-Output '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}'; exit 0 }
    "deny"    { Write-Output '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny"}}}'; exit 0 }
    "pending" { }
    default   { exit 0 }
  }
  Start-Sleep -Seconds 2
}
exit 0
