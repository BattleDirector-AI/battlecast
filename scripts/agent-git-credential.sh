#!/usr/bin/env bash
# git credential helper for github.com as the battledirector-agent App. On `get` it mints
# an installation token and prints it to git on stdout; on a mint failure it prints
# `quit=1` (git stops asking later helpers and prompting, gitcredentials(7)) and exits
# non-zero with no password line. Never logs the token and never falls back to another
# credential. See CONTRIBUTING.md, "Agent identity".
set -euo pipefail
{ set +x; } 2>/dev/null

[ "${1:-}" = "get" ] || exit 0

token="$(gh token generate --app-id 5414605 --installation-id 173849151 \
    --key "${USERPROFILE:-$HOME}/.battledirector-agent/private-key.pem" --token-only)" || {
    echo quit=1
    exit 1
}
[ -n "$token" ] || {
    echo quit=1
    exit 1
}
printf 'username=x-access-token\npassword=%s\n' "$token"
