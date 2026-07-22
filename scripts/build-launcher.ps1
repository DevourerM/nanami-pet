$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$launcherDirectory = Join-Path $projectRoot 'launcher'
$source = Join-Path $launcherDirectory 'NanamiPetLauncher.cs'
$iconPng = Join-Path $projectRoot 'icon.png'
$buildDirectory = Join-Path $projectRoot 'launcher\.build'
$iconIco = Join-Path $buildDirectory 'icon.ico'
$output = Join-Path $projectRoot 'Nanami Pet.exe'
$python = Join-Path $projectRoot 'services\nanami-tts\runtime\python.exe'
$compiler = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'

if (-not (Test-Path -LiteralPath $iconPng)) { throw "Missing project icon: $iconPng" }
if (-not (Test-Path -LiteralPath $python)) { throw "Missing local Python runtime: $python" }
if (-not (Test-Path -LiteralPath $compiler)) { throw "Missing Windows C# compiler: $compiler" }

New-Item -ItemType Directory -Path $buildDirectory -Force | Out-Null
& $python (Join-Path $launcherDirectory 'create-launcher-icon.py') $iconPng $iconIco
if ($LASTEXITCODE -ne 0) { throw 'Unable to create launcher icon.' }

& $compiler /nologo /target:winexe /out:$output /win32icon:$iconIco /r:System.Windows.Forms.dll $source
if ($LASTEXITCODE -ne 0) { throw 'Unable to compile Nanami Pet.exe.' }

Write-Host "Created $output"
