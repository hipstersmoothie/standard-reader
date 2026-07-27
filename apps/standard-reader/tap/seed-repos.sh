#!/usr/bin/env bash
# Seed tap with an initial set of repos to backfill. Useful for local dev or to
# bootstrap before the signal-collection enumeration finds everything.
#
# Usage:
#   ./seed-repos.sh did:plc:aaa did:plc:bbb ...
#   ./seed-repos.sh                      # uses the DIDS default below
#
# Requires tap running and TAP_ADMIN_PASSWORD exported (or in tap/.env).
set -euo pipefail

cd "$(dirname "$0")"
if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a && source .env && set +a
fi

TAP_API_URL="${TAP_API_URL:-http://127.0.0.1:2480}"
: "${TAP_ADMIN_PASSWORD:?set TAP_ADMIN_PASSWORD (env or tap/.env)}"

# Default seed: the standard.site lexicon publisher repo. Replace/extend with
# known publications you want to index first.
DEFAULT_DIDS=("did:plc:re3ebnp5v7ffagz6rb6xfei4")
DIDS=("${@:-${DEFAULT_DIDS[@]}}")

# Build a JSON array of DIDs.
json_dids=$(printf '"%s",' "${DIDS[@]}")
json_dids="[${json_dids%,}]"

echo "Adding ${#DIDS[@]} repo(s) to tap at ${TAP_API_URL} ..."
curl -fsSL -u "admin:${TAP_ADMIN_PASSWORD}" \
  -X POST "${TAP_API_URL}/repos/add" \
  -H "Content-Type: application/json" \
  -d "{\"dids\": ${json_dids}}"
echo
echo "Done. Watch backfill: curl -u admin:*** ${TAP_API_URL}/stats/repo-count"
