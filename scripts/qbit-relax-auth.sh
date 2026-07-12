#!/usr/bin/env bash
# qbit-relax-auth.sh — patch the qBittorrent config inside the
# test stack to skip auth for RFC1918 / loopback callers. Lets
# every *arr service hit qBit's API without dealing with the
# random "temporary password" qBit ships on first boot.
#
# Run AFTER ``docker compose up -d`` has booted qBit once
# (which creates the config file we're patching).
#
# Idempotent: re-running is a no-op when the lines are already
# present.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONF="${REPO_ROOT}/data/qbittorrent/qBittorrent/qBittorrent.conf"

if [[ ! -f "${CONF}" ]]; then
  echo "❌ ${CONF} not found." >&2
  echo "   Start qBittorrent first: docker compose -f docker-compose.test.yml up -d qbittorrent" >&2
  echo "   Wait ~10s for the config to be created, then re-run this script." >&2
  exit 1
fi

# Lines to ensure under [Preferences]. These are the same four
# settings the standalone Romarr compose's README documents —
# replicated here so the test stack works out of the box.
declare -A SETTINGS=(
  ["WebUI\\HostHeaderValidation"]="false"
  ["WebUI\\CSRFProtection"]="false"
  ["WebUI\\AuthSubnetWhitelistEnabled"]="true"
  ["WebUI\\AuthSubnetWhitelist"]="10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8"
)

# Use awk to update [Preferences] in place. Append missing
# settings; replace existing ones so a re-run isn't additive.
TMP="$(mktemp)"
trap 'rm -f "${TMP}"' EXIT

awk -v keys_str="$(printf '%s\n' "${!SETTINGS[@]}")" \
    -v vals_str="$(for k in "${!SETTINGS[@]}"; do printf '%s\n' "${SETTINGS[$k]}"; done)" '
BEGIN {
  n = split(keys_str, keys, "\n");
  split(vals_str, vals, "\n");
  for (i = 1; i <= n; i++) {
    if (keys[i] != "") {
      target[keys[i]] = vals[i];
    }
  }
  in_prefs = 0;
  found_prefs = 0;
}
/^\[Preferences\]/ {
  in_prefs = 1;
  found_prefs = 1;
  print;
  next;
}
/^\[/ {
  if (in_prefs) {
    # Emit any keys not yet seen before leaving the section.
    for (k in target) {
      if (!(k in seen)) {
        print k "=" target[k];
      }
    }
  }
  in_prefs = 0;
}
{
  if (in_prefs) {
    for (k in target) {
      if (index($0, k "=") == 1) {
        print k "=" target[k];
        seen[k] = 1;
        next;
      }
    }
  }
  print;
}
END {
  if (in_prefs) {
    for (k in target) {
      if (!(k in seen)) {
        print k "=" target[k];
      }
    }
  }
  if (!found_prefs) {
    print "[Preferences]";
    for (k in target) {
      print k "=" target[k];
    }
  }
}
' "${CONF}" > "${TMP}"

cp "${CONF}" "${CONF}.bak.$(date +%s)"
mv "${TMP}" "${CONF}"
trap - EXIT

echo "✅ Patched ${CONF}"
echo "   Backup saved as ${CONF}.bak.<timestamp>"
echo "   Restart qBit: docker compose -f docker-compose.test.yml restart qbittorrent"
