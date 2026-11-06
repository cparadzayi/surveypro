<#
.SYNOPSIS
  Runs the SurveyPro dev servers (backend :3050, frontend :5173) independently of any editor or app,
  and restarts either one within seconds if it exits.

.DESCRIPTION
  Why: the Claude desktop app stops the servers it starts (after 30 minutes to a couple of hours), and
  nothing started from inside it can outlive it. These run as hidden, detached processes of their own.

    powershell -ExecutionPolicy Bypass -File scripts\dev-servers.ps1 start    # start both (idempotent)
    powershell -ExecutionPolicy Bypass -File scripts\dev-servers.ps1 status   # running? answering?
    powershell -ExecutionPolicy Bypass -File scripts\dev-servers.ps1 stop     # stop both and their children
    powershell -ExecutionPolicy Bypass -File scripts\dev-servers.ps1 restart

  Logs and pids live in .dev-logs/ (git-ignored): backend.log, frontend.log, <name>.pid.
  The backend still restarts itself on file edits (nodemon); this only restarts it if it EXITS.
#>
param(
  [Parameter(Position = 0)][ValidateSet('start', 'stop', 'status', 'restart', 'supervise')][string]$Action = 'status',
  [string]$Name,   # supervise only: backend | frontend
  [string]$Dir,    # supervise only: app-backend | app-frontend
  [string]$Extra = ''  # supervise only: a flag name (no dashes) passed on as `npm run dev -- --<Extra>`
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $Root '.dev-logs'
$Servers = @(
  # --exitcrash: by default nodemon sits waiting for a file change after the app crashes, and so never
  # exits for the supervisor to see; with it a crash ends nodemon and the loop restarts it.
  @{ Name = 'backend';  Dir = 'app-backend';  Port = 3050; Probe = 'http://127.0.0.1:3050/api/health'; Extra = 'exitcrash' },
  @{ Name = 'frontend'; Dir = 'app-frontend'; Port = 5173; Probe = 'http://127.0.0.1:5173/'; Extra = '' }
)

function Get-PidFile($n) { Join-Path $LogDir "$n.pid" }

function Test-PortListening($port) {
  [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

function Test-Answers($url) {
  try { (Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 5).StatusCode -lt 500 } catch { $false }
}

function Get-SupervisorPid($n) {
  $f = Get-PidFile $n
  if (-not (Test-Path $f)) { return $null }
  $id = [int](Get-Content $f -ErrorAction SilentlyContinue | Select-Object -First 1)
  if ($id -and (Get-Process -Id $id -ErrorAction SilentlyContinue)) { return $id }
  Remove-Item $f -ErrorAction SilentlyContinue
  return $null
}

# The loop that does the restarting: run the dev command, and when it exits, wait and run it again.
if ($Action -eq 'supervise') {
  New-Item -ItemType Directory -Force $LogDir | Out-Null
  $log = Join-Path $LogDir "$Name.log"
  Set-Location (Join-Path $Root $Dir)
  while ($true) {
    if ((Test-Path $log) -and ((Get-Item $log).Length -gt 5MB)) { Move-Item $log "$log.old" -Force }
    Add-Content $log "[$(Get-Date -Format s)] supervisor: starting $Name"
    $dev = if ($Extra) { "npm run dev -- --$Extra" } else { 'npm run dev' }  # Extra is a bare flag name: a leading dash would be read as a parameter
    cmd /c "$dev >> `"$log`" 2>&1"
    Add-Content $log "[$(Get-Date -Format s)] supervisor: $Name exited ($LASTEXITCODE); restarting in 3 s"
    Start-Sleep -Seconds 3
  }
}

function Start-All {
  New-Item -ItemType Directory -Force $LogDir | Out-Null
  foreach ($s in $Servers) {
    if (Get-SupervisorPid $s.Name) { Write-Host "$($s.Name): already supervised"; continue }
    if (Test-PortListening $s.Port) {
      Write-Host "$($s.Name): port $($s.Port) is already in use by something else - stop it first (not started)"
      continue
    }
    $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', $PSCommandPath,
      'supervise', '-Name', $s.Name, '-Dir', $s.Dir)
    if ($s.Extra) { $argList += @('-Extra', $s.Extra) }  # an empty argument would be dropped and leave -Extra bare
    $p = Start-Process -FilePath 'powershell.exe' -ArgumentList $argList -WindowStyle Hidden -PassThru
    Set-Content (Get-PidFile $s.Name) $p.Id
    Write-Host "$($s.Name): started (supervisor pid $($p.Id)), log .dev-logs\$($s.Name).log"
  }
}

function Stop-All {
  foreach ($s in $Servers) {
    $id = Get-SupervisorPid $s.Name
    if ($id) {
      # /T takes the whole tree: the supervisor, cmd, npm and node.
      taskkill /PID $id /T /F | Out-Null
      Remove-Item (Get-PidFile $s.Name) -ErrorAction SilentlyContinue
      Write-Host "$($s.Name): stopped"
    } else {
      Write-Host "$($s.Name): not supervised"
    }
  }
}

function Show-Status {
  foreach ($s in $Servers) {
    $id = Get-SupervisorPid $s.Name
    $up = Test-Answers $s.Probe
    $state = if ($up) { 'answering' } elseif (Test-PortListening $s.Port) { 'port open, not answering yet' } else { 'down' }
    $sup = if ($id) { "supervised (pid $id)" } else { 'not supervised' }
    Write-Host ("{0,-9} {1,-24} {2}" -f $s.Name, $sup, $state)
  }
}

switch ($Action) {
  'start'   { Start-All; Start-Sleep -Seconds 2; Show-Status }
  'stop'    { Stop-All }
  'restart' { Stop-All; Start-Sleep -Seconds 2; Start-All; Start-Sleep -Seconds 2; Show-Status }
  'status'  { Show-Status }
}
