#!/usr/bin/env bash
# bootstrap-test-stack.sh — patch allseerr settings.json with the
# URLs of the docker-compose.test.yml stack so allseerr can talk
# to each service out of the box.
#
# This script ONLY sets URLs (hostname + port + URL bases). API
# keys are NOT auto-populated — you still need to grab them
# manually from each service's WebUI (each one only mints its
# admin key on first login) and paste them into the allseerr
# Settings UI.
#
# Usage:
#   ./scripts/bootstrap-test-stack.sh           # writes config/settings.json
#   ./scripts/bootstrap-test-stack.sh --dry-run # show what would change
#
# Requires: jq (standard in most distros).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SETTINGS_FILE="${REPO_ROOT}/config/settings.json"
DRY_RUN="${1:-}"

if [[ ! -f "${SETTINGS_FILE}" ]]; then
  echo "❌ ${SETTINGS_FILE} not found." >&2
  echo "   Start allseerr at least once so initial settings are seeded," >&2
  echo "   then re-run this script." >&2
  exit 1
fi

if ! command -v jq >/dev/null; then
  echo "❌ jq is required (https://jqlang.github.io/jq/)." >&2
  exit 1
fi

# Service URLs as exposed by docker-compose.test.yml on host.
# Allseerr runs on the docker host so it reaches each service
# through localhost:<host_port>.
ROMM_URL_HOST="localhost"
ROMM_PORT=8181
ROMARR_HOST="localhost"
ROMARR_PORT=8585
AUDIOBOOKSHELF_HOST="localhost"
AUDIOBOOKSHELF_PORT=13378
BINDERY_HOST="localhost"
BINDERY_PORT=8787
PRESSARR_HOST="localhost"
PRESSARR_PORT=8084
QBITTORRENT_HOST="localhost"
QBITTORRENT_PORT=8088

TMP="$(mktemp)"
trap 'rm -f "${TMP}"' EXIT

# Patch ROMM (book → game → romm) — the existing ROMM settings
# block needs URL + port populated. API key + admin creds stay
# untouched (operator fills via UI).
jq \
  --arg rommUrl "http://${ROMM_URL_HOST}:${ROMM_PORT}" \
  --arg rommPublic "http://${ROMM_URL_HOST}:${ROMM_PORT}" \
  --arg absUrl "http://${AUDIOBOOKSHELF_HOST}:${AUDIOBOOKSHELF_PORT}" \
  --arg absPublic "http://${AUDIOBOOKSHELF_HOST}:${AUDIOBOOKSHELF_PORT}" '
  # ROMM (games library, "Play" role)
  .game.romm.url = $rommUrl
  | .game.romm.publicUrl = $rommPublic
  | .game.romm.enabled = true

  # Audiobookshelf (book + audiobook library)
  | .book.audiobookshelf.url = $absUrl
  | .book.audiobookshelf.publicUrl = $absPublic
  | .book.audiobookshelf.enabled = true
' "${SETTINGS_FILE}" > "${TMP}"

# Romarr — settings.romarr is an array of instances. Add one
# pointing at the compose-internal default. We INSERT only if
# no instance exists for "romarr:dev" yet so re-runs are
# idempotent.
jq \
  --arg romarrHost "${ROMARR_HOST}" \
  --argjson romarrPort "${ROMARR_PORT}" '
  if (.romarr // []) | any(.hostname == $romarrHost and .port == $romarrPort) then
    .
  else
    .romarr = ((.romarr // []) + [{
      "id": ((.romarr // []) | length),
      "name": "Romarr (test stack)",
      "hostname": $romarrHost,
      "port": $romarrPort,
      "apiKey": "",
      "useSsl": false,
      "isDefault": true
    }])
  end
' "${TMP}" > "${TMP}.2" && mv "${TMP}.2" "${TMP}"

# Bindery — same multi-instance shape. Pre-create one default
# instance for "book" mediaType. Audiobook can be a second
# instance pointing at the same Bindery — Bindery itself
# handles both formats, so the same hostname+port is fine.
jq \
  --arg binderyHost "${BINDERY_HOST}" \
  --argjson binderyPort "${BINDERY_PORT}" '
  if (.bindery // []) | any(.hostname == $binderyHost and .port == $binderyPort) then
    .
  else
    .bindery = ((.bindery // []) + [{
      "id": ((.bindery // []) | length),
      "name": "Bindery (test stack)",
      "hostname": $binderyHost,
      "port": $binderyPort,
      "apiKey": "",
      "useSsl": false,
      "isDefault": true,
      "mediaType": "book",
      "activeProfileId": 1,
      "activeProfileName": "Standard",
      "activeDirectory": "/books",
      "tags": [],
      "preventSearch": false,
      "syncEnabled": false,
      "tagRequests": false
    }])
  end
' "${TMP}" > "${TMP}.2" && mv "${TMP}.2" "${TMP}"

# Preview vs write.
if [[ "${DRY_RUN}" == "--dry-run" ]]; then
  echo "─── Diff (settings.json → patched) ───────────────────────────"
  diff -u "${SETTINGS_FILE}" "${TMP}" || true
  echo "─────────────────────────────────────────────────────────────"
  echo "Dry-run: nothing written. Re-run without --dry-run to apply."
else
  cp "${SETTINGS_FILE}" "${SETTINGS_FILE}.bak.$(date +%s)"
  mv "${TMP}" "${SETTINGS_FILE}"
  trap - EXIT
  echo "✅ Patched ${SETTINGS_FILE}"
  echo "   Backup saved as ${SETTINGS_FILE}.bak.<timestamp>"
  echo
  echo "Next steps:"
  echo "  1. Restart allseerr (dev: nodemon picks it up; prod: docker restart)."
  echo "  2. Open each service's WebUI, complete first-run setup, copy the API key."
  echo "  3. Paste each key in Settings → Services."
  echo
  echo "Service WebUIs:"
  echo "  ROMM           http://${ROMM_URL_HOST}:${ROMM_PORT}"
  echo "  Romarr         http://${ROMARR_HOST}:${ROMARR_PORT}"
  echo "  Audiobookshelf http://${AUDIOBOOKSHELF_HOST}:${AUDIOBOOKSHELF_PORT}"
  echo "  Bindery        http://${BINDERY_HOST}:${BINDERY_PORT}"
  echo "  Pressarr       http://${PRESSARR_HOST}:${PRESSARR_PORT}"
  echo "  qBittorrent    http://${QBITTORRENT_HOST}:${QBITTORRENT_PORT}"
fi
