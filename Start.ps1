$ErrorActionPreference = 'Stop'
$playerRoot = $PSScriptRoot
$playerUrl = 'http://127.0.0.1:47831'
try { $playerReady = (Invoke-WebRequest -Uri "$playerUrl/api/songs" -TimeoutSec 2).StatusCode -eq 200 } catch { $playerReady = $false }
if (-not $playerReady) {
    $nodeCommand = (Get-Command node -ErrorAction Stop).Source
    Start-Process -FilePath $nodeCommand -ArgumentList ('"' + (Join-Path $playerRoot 'server.mjs') + '"') -WorkingDirectory $playerRoot -WindowStyle Hidden
    for ($playerAttempt = 0; $playerAttempt -lt 30; $playerAttempt++) {
        Start-Sleep -Milliseconds 200
        try { $playerReady = (Invoke-WebRequest -Uri "$playerUrl/api/songs" -TimeoutSec 1).StatusCode -eq 200; if ($playerReady) { break } } catch {}
    }
}
if (-not $playerReady) { throw 'Suno Player could not start. Run node server.mjs from this folder to see the error.' }
Start-Process $playerUrl
