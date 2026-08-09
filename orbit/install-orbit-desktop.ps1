param(
    [switch]$NoStartup
)

$ErrorActionPreference = "Stop"
$launcher = Join-Path $PSScriptRoot "start-orbit-desktop.ps1"
$desktopDirectory = [Environment]::GetFolderPath("Desktop")
$startupDirectory = [Environment]::GetFolderPath("Startup")
$shell = New-Object -ComObject WScript.Shell

if (-not (Test-Path -LiteralPath $launcher)) {
    throw "Orbit launcher was not found at $launcher."
}

function New-OrbitShortcut {
    param([string]$Path)
    $shortcut = $shell.CreateShortcut($Path)
    $shortcut.TargetPath = "powershell.exe"
    $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`""
    $shortcut.WorkingDirectory = $PSScriptRoot
    $shortcut.Description = "Launch Orbit Desktop Companion"
    $shortcut.Save()
}

& $launcher
New-OrbitShortcut -Path (Join-Path $desktopDirectory "Orbit Desktop.lnk")

if (-not $NoStartup) {
    New-OrbitShortcut -Path (Join-Path $startupDirectory "Orbit Desktop.lnk")
}

Write-Host "Orbit Desktop is installed and running."
Write-Host "Desktop shortcut: $(Join-Path $desktopDirectory 'Orbit Desktop.lnk')"
if (-not $NoStartup) { Write-Host "Orbit will start with Windows." }

