$ErrorActionPreference = "Stop"
$ProjectDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $ProjectDirectory

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Orbit requires Node.js for development. Install it from https://nodejs.org/ and try again."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "Orbit could not find npm on PATH."
}
if (-not (Test-Path -LiteralPath (Join-Path $ProjectDirectory "node_modules\electron\package.json"))) {
  Write-Host "Installing Orbit development dependencies..."
  & npm install
  if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed." }
}

& npm run dev
if ($LASTEXITCODE -ne 0) { throw "Orbit stopped with exit code $LASTEXITCODE." }
