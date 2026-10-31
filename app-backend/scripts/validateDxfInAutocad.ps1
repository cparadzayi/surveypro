<#
.SYNOPSIS
  Opens a DXF in AutoCAD (headless: no window), audits it, and saves it as a DWG.

.DESCRIPTION
  AutoCAD is stricter than any test we can write: a DXF with one thing it does not accept is discarded
  whole ("Invalid or incomplete DXF input -- drawing discarded"). This runs the file through the real
  AutoCAD Core Console and reports what AutoCAD said, how many entities it kept, and whether the
  audit found errors. The DWG it writes is also the way to turn the diagram DXF into a DWG.

  Needs AutoCAD installed (the Core Console, accoreconsole.exe). Paths use forward slashes.

.EXAMPLE
  .\validateDxfInAutocad.ps1 -Dxf C:/work/diagram.dxf -Dwg C:/work/diagram.dwg
#>
param(
  [Parameter(Mandatory)][string]$Dxf,
  [Parameter(Mandatory)][string]$Dwg,
  [string]$Core = 'C:\Program Files\Autodesk\AutoCAD 2027\accoreconsole.exe',
  [string]$Work = "$env:TEMP\dxf-validate"
)
New-Item -ItemType Directory -Force $Work | Out-Null
$log = Join-Path $Work 'log.txt'
Remove-Item $log -ErrorAction SilentlyContinue
if (Test-Path $Dwg) { Remove-Item $Dwg }
$logLisp = $log.Replace([string][char]92, '/')
$lines = @(
  "(defun L (s / f) (setq f (open `"$logLisp`" `"a`")) (write-line s f) (close f))",
  '(setvar "FILEDIA" 0)',
  "(command `"_.DXFIN`" `"$Dxf`")",
  '(L (strcat "entities=" (itoa (if (ssget "_X") (sslength (ssget "_X")) 0))))',
  '(command "_.ZOOM" "_E")',
  '(command "_.AUDIT" "Y")',
  "(command `"_.SAVEAS`" `"2018`" `"$Dwg`")",
  '(L "saved")',
  '(command "_.QUIT" "Y")'
)
$scr = Join-Path $Work 'v.scr'
Set-Content -Path $scr -Value $lines -Encoding ASCII
$empty = Join-Path $Work 'empty.txt'; New-Item -ItemType File -Force $empty | Out-Null
$out = Join-Path $Work 'out.txt'
# Launched like this (not from a shell that pipes stdin), the console runs the script to the end.
$p = Start-Process -FilePath $Core -ArgumentList '/s', $scr, '/l', 'en-US' -NoNewWindow -PassThru `
  -RedirectStandardOutput $out -RedirectStandardInput $empty -RedirectStandardError (Join-Path $Work 'err.txt')
if (-not $p.WaitForExit(120000)) { $p.Kill(); Write-Host 'AutoCAD did not finish in 120 s' }
Write-Host '--- kept'; if (Test-Path $log) { Get-Content $log }
Write-Host '--- AutoCAD said'
((Get-Content $out -Raw) -replace "`0", '') -split "`n" |
  Where-Object { $_ -match 'Error|Invalid|did not|Did not|discard|Total errors|Unknown' } | Select-Object -First 20
Write-Host "--- dwg written: $(Test-Path $Dwg)"
