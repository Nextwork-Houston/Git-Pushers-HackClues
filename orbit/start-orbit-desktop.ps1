param(
    [string]$OrbitDirectory = (Join-Path $PSScriptRoot "desktop")
)

$ErrorActionPreference = "Stop"
$packagePath = Join-Path $OrbitDirectory "package.json"
$electronPath = Join-Path $OrbitDirectory "node_modules\.bin\electron.cmd"
$electronBinary = Join-Path $OrbitDirectory "node_modules\electron\dist\electron.exe"

if (-not (Test-Path -LiteralPath $packagePath)) {
    throw "Orbit desktop package was not found at $OrbitDirectory."
}

if (-not (Test-Path -LiteralPath $electronPath) -or -not (Test-Path -LiteralPath $electronBinary)) {
    Push-Location $OrbitDirectory
    try {
        npm install
        if (-not (Test-Path -LiteralPath $electronBinary)) {
            node "node_modules\electron\install.js"
        }
    }
    finally { Pop-Location }
}

$env:ELECTRON_RUN_AS_NODE = $null
Start-Process -FilePath $electronPath -ArgumentList "." -WorkingDirectory $OrbitDirectory
