#!/bin/bash
# Allseerr dev server launcher
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 22 2>/dev/null

# Temporarily disable engine-strict for Node 25 compat
cp .npmrc .npmrc.bak 2>/dev/null
echo "engine-strict=false" > .npmrc

# Start dev server (bind to all interfaces for LAN access)
HOST=0.0.0.0 npx pnpm@10.24.0 run dev

# Restore .npmrc on exit
trap 'mv .npmrc.bak .npmrc 2>/dev/null' EXIT
