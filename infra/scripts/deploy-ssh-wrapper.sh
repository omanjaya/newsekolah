#!/usr/bin/env bash
# Forced command for the CI deploy key's authorized_keys entry on the VPS.
# Installed with `command="/root/sion/infra/scripts/deploy-ssh-wrapper.sh" ...`
# (see infra/README.md "Continuous deployment" for the full setup), this
# script is the *only* thing that key can ever run: it validates the client
# requested exactly `deploy.sh staging <sha>` or `deploy.sh production <sha>`
# with a well-formed 40-hex commit SHA, then execs the real deploy.sh with
# those two arguments -- nothing else, regardless of what the SSH client
# actually asked for.
#
# SSH puts the client's requested command line in $SSH_ORIGINAL_COMMAND when
# the key's authorized_keys entry forces a command; this script never trusts
# $SSH_ORIGINAL_COMMAND for anything other than parsing out those two
# arguments to validate. In particular it never eval's or otherwise executes
# it directly, so a compromised or misused CI job cannot ask this key to run
# an arbitrary command on the VPS -- at most it can trigger a deploy of a
# commit SHA that has to already exist in the repository's history.
set -euo pipefail

DEPLOY_SCRIPT="${DEPLOY_SCRIPT:-/root/sion/infra/scripts/deploy.sh}"

deny() {
    printf 'deploy-ssh-wrapper: %s\n' "$1" >&2
    exit 1
}

[[ -n "${SSH_ORIGINAL_COMMAND:-}" ]] || deny "no command given (this key can only run deploy.sh staging|production <sha>)"

# shellcheck disable=SC2206 # deliberate word-splitting: SSH_ORIGINAL_COMMAND
# is a simple space-separated "deploy.sh <target> <sha>" line, never passed
# through a shell, so no quoting/globbing semantics need preserving.
read -r -a args <<<"$SSH_ORIGINAL_COMMAND"

[[ "${#args[@]}" -eq 3 ]] || deny "expected 3 words (deploy.sh <target> <sha>), got: ${SSH_ORIGINAL_COMMAND}"
[[ "${args[0]}" == "deploy.sh" ]] || deny "only deploy.sh may be run, got: ${args[0]}"

target="${args[1]}"
sha="${args[2]}"

case "$target" in
    staging | production) ;;
    *) deny "unknown target '${target}' (expected 'staging' or 'production')" ;;
esac

[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || deny "ref must be a 40-character lowercase hex commit SHA, got: ${sha}"

exec "$DEPLOY_SCRIPT" "$target" "$sha"
