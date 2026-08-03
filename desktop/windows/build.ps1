$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "../..")
npm install
npx electron-builder --win nsis portable --config desktop/windows/electron-builder.yml
