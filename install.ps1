# install.ps1 — roseglassdb one-shot setup for Windows
# Run in PowerShell (does NOT require Administrator for most steps)
# Prereq: Windows 10/11 with App Installer (winget) available

$ErrorActionPreference = 'Stop'
$ProjectRoot = $PSScriptRoot

function Write-Step($msg) {
    Write-Host "`n>>> $msg" -ForegroundColor Cyan
}
function Test-Cmd($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}
function Winget-Install($id, $label) {
    Write-Host "  Installing $label..." -ForegroundColor Yellow
    winget install -e --id $id `
        --accept-package-agreements --accept-source-agreements --silent
}

# ── winget check ──────────────────────────────────────────────────────────────
if (-not (Test-Cmd 'winget')) {
    Write-Host 'winget not found. Install "App Installer" from the Microsoft Store first.' -ForegroundColor Red
    exit 1
}

# ── Docker Desktop ────────────────────────────────────────────────────────────
Write-Step 'Docker Desktop'
if (-not (Test-Cmd 'docker')) {
    Winget-Install 'Docker.DockerDesktop' 'Docker Desktop'
    Write-Host @'

  Docker Desktop was just installed.
  Please:
    1. Launch Docker Desktop from the Start menu and let it finish starting up
    2. Re-run this script

'@ -ForegroundColor Yellow
    exit 0
}

# Wait for the Docker daemon to be responsive
Write-Host '  Waiting for Docker daemon...' -NoNewline
$tries = 0
while ($tries -lt 15) {
    if ((docker info 2>$null) -ne $null) { break }
    Write-Host '.' -NoNewline
    Start-Sleep 2
    $tries++
}
Write-Host ''
if ($tries -ge 15) {
    Write-Host '  Docker daemon not responding. Open Docker Desktop and wait for it to start, then re-run.' -ForegroundColor Red
    exit 1
}
Write-Host '  Docker is running.'

# ── Python ────────────────────────────────────────────────────────────────────
Write-Step 'Python 3.11'
$python = $null
foreach ($cmd in @('python3.11','python3','python','py')) {
    if (Test-Cmd $cmd) {
        $ver = (& $cmd --version 2>&1) -replace 'Python ',''
        if ($ver -match '^3\.(1[1-9]|\d{2,})') { $python = $cmd; break }
    }
}
if (-not $python) {
    Winget-Install 'Python.Python.3.11' 'Python 3.11'
    # Refresh PATH
    $env:PATH = [System.Environment]::GetEnvironmentVariable('PATH','Machine') + ';' +
                [System.Environment]::GetEnvironmentVariable('PATH','User')
    $python = 'python'
}
Write-Host "  Using: $python ($( & $python --version 2>&1 ))"

# ── Node.js ───────────────────────────────────────────────────────────────────
Write-Step 'Node.js'
if (-not (Test-Cmd 'node')) {
    Winget-Install 'OpenJS.NodeJS.LTS' 'Node.js LTS'
    $env:PATH = [System.Environment]::GetEnvironmentVariable('PATH','Machine') + ';' +
                [System.Environment]::GetEnvironmentVariable('PATH','User')
}
Write-Host "  Node $(node --version)  /  npm $(npm --version)"

# ── ffmpeg ────────────────────────────────────────────────────────────────────
Write-Step 'ffmpeg'
if (-not (Test-Cmd 'ffmpeg')) {
    Winget-Install 'Gyan.FFmpeg' 'ffmpeg'
    $env:PATH = [System.Environment]::GetEnvironmentVariable('PATH','Machine') + ';' +
                [System.Environment]::GetEnvironmentVariable('PATH','User')
}
Write-Host "  $(ffmpeg -version 2>&1 | Select-Object -First 1)"

# ── PostgreSQL + pgvector via Docker ─────────────────────────────────────────
Write-Step 'PostgreSQL + pgvector (Docker)'
$container = 'roseglassdb-postgres'
$exists = docker ps -a --filter "name=^/${container}$" --format '{{.Names}}' 2>$null
if (-not $exists) {
    Write-Host '  Pulling pgvector/pgvector:pg16...'
    docker pull pgvector/pgvector:pg16
    docker run -d `
        --name $container `
        -p 5432:5432 `
        -e POSTGRES_DB=roseglassdb `
        -e POSTGRES_USER=roseglassdb `
        -e POSTGRES_PASSWORD=roseglassdb `
        --restart unless-stopped `
        pgvector/pgvector:pg16 | Out-Null
    Write-Host '  Waiting for PostgreSQL to accept connections...' -NoNewline
    Start-Sleep 3
    $tries = 0
    while ($tries -lt 10) {
        $ready = docker exec $container pg_isready -U roseglassdb 2>$null
        if ($LASTEXITCODE -eq 0) { break }
        Write-Host '.' -NoNewline
        Start-Sleep 2
        $tries++
    }
    Write-Host ''
} else {
    docker start $container 2>$null | Out-Null
    Start-Sleep 2
}
Write-Host '  PostgreSQL ready.'

# ── .env ──────────────────────────────────────────────────────────────────────
Write-Step '.env'
$envFile = Join-Path $ProjectRoot '.env'
if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $ProjectRoot '.env.example') $envFile
    Write-Host '  Created .env from .env.example'
} else {
    Write-Host '  .env already exists, skipping.'
}

# ── Python venv ───────────────────────────────────────────────────────────────
Write-Step 'Python virtual environment'
$venv   = Join-Path $ProjectRoot '.venv'
$pip    = Join-Path $venv 'Scripts\pip.exe'
$reqs   = Join-Path $ProjectRoot 'requirements.txt'
if (-not (Test-Path $venv)) {
    & $python -m venv $venv
}
& $pip install --upgrade pip -q
& $pip install -r $reqs
Write-Host '  Python dependencies installed.'

# ── Database schema ───────────────────────────────────────────────────────────
Write-Step 'Loading database schema'
$schemaFiles = @(
    'db\video_and_analysis.sql',
    'db\analysis_refinements.sql',
    'db\beat_slicing.sql',
    'db\stem_splitting.sql',
    'db\sample_extraction.sql'
)
foreach ($f in $schemaFiles) {
    $full = Join-Path $ProjectRoot $f
    if (Test-Path $full) {
        Write-Host "  $f"
        Get-Content $full | docker exec -i $container psql -U roseglassdb -d roseglassdb -q
    } else {
        Write-Host "  $f  (not found, skipping)" -ForegroundColor DarkGray
    }
}

# ── Frontend ──────────────────────────────────────────────────────────────────
Write-Step 'Frontend dependencies'
Push-Location (Join-Path $ProjectRoot 'frontend')
npm install --silent
Pop-Location
Write-Host '  npm install done.'

# ── samples dir ───────────────────────────────────────────────────────────────
$samplesDir = Join-Path $ProjectRoot 'samples'
if (-not (Test-Path $samplesDir)) { New-Item -ItemType Directory $samplesDir | Out-Null }

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host @"

================================================================
  Installation complete!

  To ingest a track and extract loops:
    .\.venv\Scripts\python -m workers.beat_slicer ingest "C:\path\to\track.wav"

  To launch the UI:
    .\start.ps1

================================================================
"@ -ForegroundColor Green
