#!/usr/bin/env bash
# Run gh as the battledirector-agent App: mint an installation token, export it as
# GH_TOKEN for this process only, and exec gh. Never prints or logs the token and
# never falls back to another credential. See CONTRIBUTING.md, "Agent identity".
set -euo pipefail
{ set +x; } 2>/dev/null

GH_TOKEN="$(gh token generate --app-id 5414605 --installation-id 173849151 \
    --key "${USERPROFILE:-$HOME}/.battledirector-agent/private-key.pem" --token-only)"
[ -n "$GH_TOKEN" ] || exit 1
export GH_TOKEN
exec gh "$@"
