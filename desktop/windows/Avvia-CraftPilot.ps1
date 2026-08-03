$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "../..")
if (-not (Test-Path "node_modules")) { npm install }
npm run desktop:windows
