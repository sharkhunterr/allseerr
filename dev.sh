#!/bin/bash
# Allseerr dev server launcher
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 22 2>/dev/null

# Temporarily disable engine-strict for Node 25 compat
cp .npmrc .npmrc.bak 2>/dev/null
echo "engine-strict=false" > .npmrc

# Kill anything still listening on port 5055 from a previous run
PORT="${PORT:-5055}"
LEFTOVER="$(lsof -ti :"$PORT" 2>/dev/null)"
if [ -n "$LEFTOVER" ]; then
  echo "Killing leftover process(es) on port $PORT: $LEFTOVER"
  kill -9 $LEFTOVER 2>/dev/null
  sleep 1
fi

# Cleanup: restore .npmrc AND kill the whole process group (nodemon spawns
# children that don't always die on Ctrl+C, keeping port 5055 bound)
cleanup() {
  mv .npmrc.bak .npmrc 2>/dev/null
  if [ -n "$DEV_PID" ]; then
    # Kill the whole process group (negative PID) so nodemon + next + ts-node all go
    kill -TERM -"$DEV_PID" 2>/dev/null
    sleep 1
    kill -KILL -"$DEV_PID" 2>/dev/null
  fi
  # Double-check port is free
  STILL="$(lsof -ti :"$PORT" 2>/dev/null)"
  [ -n "$STILL" ] && kill -9 $STILL 2>/dev/null
}
trap cleanup EXIT INT TERM

# Start dev server in its own process group so we can kill all children cleanly
set -m
HOST=0.0.0.0 PORT="$PORT" npx pnpm@10.24.0 run dev &
DEV_PID=$!
wait $DEV_PID
