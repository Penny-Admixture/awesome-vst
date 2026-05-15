# start.ps1 — launch roseglassdb
# Run this every time you want to use the tool after install.ps1 has been run once.

$ProjectRoot  = $PSScriptRoot
$container    = 'roseglassdb-postgres'
$frontendPort = 5173

# ── Database ──────────────────────────────────────────────────────────────────
$running = docker ps --filter "name=^/${container}$" --filter 'status=running' --format '{{.Names}}' 2>$null
if (-not $running) {
    Write-Host 'Starting database container...' -ForegroundColor Cyan
    docker start $container | Out-Null
    Start-Sleep 3
}
Write-Host 'Database: ready' -ForegroundColor Green

# ── Frontend ──────────────────────────────────────────────────────────────────
Write-Host 'Starting frontend (Vite)...' -ForegroundColor Cyan
$frontendDir = Join-Path $ProjectRoot 'frontend'

# Launch in a new terminal window so it keeps running after this script exits
Start-Process powershell -ArgumentList `
    "-NoExit", `
    "-Command", "cd '$frontendDir'; npm run dev"

# Give Vite a moment to bind the port
Start-Sleep 3

# ── Open browser ──────────────────────────────────────────────────────────────
$url = "http://localhost:$frontendPort"
Write-Host "Opening $url" -ForegroundColor Cyan
Start-Process $url

Write-Host @"

roseglassdb is running.

  UI:       $url
  Ingest:   .\.venv\Scripts\python -m workers.beat_slicer ingest "track.wav"
  Configs:  .\.venv\Scripts\python -m workers.beat_slicer configs
  Stop DB:  docker stop $container

"@ -ForegroundColor Green
