#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
npm install
npx electron-builder --mac dmg --config desktop/macos/electron-builder.yml
