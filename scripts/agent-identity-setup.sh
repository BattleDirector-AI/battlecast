#!/usr/bin/env bash
# One-time (per clone) setup for the battledirector-agent App identity: install the git
# credential helper beside the key and point the clone of the current directory at it by
# absolute path. Never reads the key and never prints a token.
# See CONTRIBUTING.md, "Agent identity".
set -euo pipefail
{ set +x; } 2>/dev/null

KEY_DIR="$(cygpath -u "${USERPROFILE:-}" 2>/dev/null || printf %s "$HOME")/.battledirector-agent"
HELPER="$KEY_DIR/git-credential.sh"
SSH_PREFIX="git@github.com:"
HTTPS_PREFIX="https://github.com/"

[ -f "$KEY_DIR/private-key.pem" ] || {
    echo "agent-identity-setup: no private key at $KEY_DIR/private-key.pem" >&2
    exit 1
}

cp "$(dirname "$0")/agent-git-credential.sh" "$HELPER"
git config --replace-all credential.https://github.com.helper ""
git config --add credential.https://github.com.helper "!bash \"$HELPER\""
git config url."$HTTPS_PREFIX".pushInsteadOf "$SSH_PREFIX"

echo "agent-identity-setup: installed $HELPER"
echo "agent-identity-setup: github.com credential helper -> $HELPER (inherited helper emptied)"
echo "agent-identity-setup: pushes to $SSH_PREFIX go over $HTTPS_PREFIX"
