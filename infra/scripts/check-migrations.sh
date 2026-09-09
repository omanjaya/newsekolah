#!/usr/bin/env bash
# Asserts migration files are numbered sequentially with no gaps or
# duplicates, and that every "up" has a matching "down" (docs/04-clean-code.md
# section 4: "Migrasi bernomor berurutan tanpa celah, selalu berpasangan
# up/down"). Used by .github/workflows/ci.yml (migrations-check job).
#
# Usage: check-migrations.sh <migrations-dir>
set -euo pipefail

DIR="${1:?usage: check-migrations.sh <migrations-dir>}"

[[ -d "$DIR" ]] || {
    echo "error: no such directory: $DIR" >&2
    exit 1
}

mapfile -t numbers < <(
    find "$DIR" -maxdepth 1 -type f -name '[0-9][0-9][0-9][0-9]_*.up.sql' \
        -exec basename {} \; \
        | sed -E 's/^([0-9]{4})_.*/\1/' \
        | sort -n
)

if [[ "${#numbers[@]}" -eq 0 ]]; then
    echo "error: no migrations found in $DIR" >&2
    exit 1
fi

failed=0

# Duplicate numbers (two files sharing a prefix).
duplicates="$(printf '%s\n' "${numbers[@]}" | sort -n | uniq -d)"
if [[ -n "$duplicates" ]]; then
    echo "error: duplicate migration numbers:" >&2
    echo "$duplicates" >&2
    failed=1
fi

# Gaps: every number from the first to the last must be present exactly once.
first="${numbers[0]}"
last="${numbers[-1]}"
first_dec=$((10#$first))
last_dec=$((10#$last))

expected="$first_dec"
while [[ "$expected" -le "$last_dec" ]]; do
    padded="$(printf '%04d' "$expected")"
    if ! printf '%s\n' "${numbers[@]}" | grep -qx "$padded"; then
        echo "error: missing migration number $padded (gap between $first and $last)" >&2
        failed=1
    fi
    expected=$((expected + 1))
done

# Every up must have a matching down.
while IFS= read -r -d '' up_file; do
    down_file="${up_file%.up.sql}.down.sql"
    if [[ ! -f "$down_file" ]]; then
        echo "error: missing down migration for $(basename "$up_file")" >&2
        failed=1
    fi
done < <(find "$DIR" -maxdepth 1 -type f -name '[0-9][0-9][0-9][0-9]_*.up.sql' -print0)

# Every down must have a matching up (catches orphaned rollback files).
while IFS= read -r -d '' down_file; do
    up_file="${down_file%.down.sql}.up.sql"
    if [[ ! -f "$up_file" ]]; then
        echo "error: missing up migration for $(basename "$down_file")" >&2
        failed=1
    fi
done < <(find "$DIR" -maxdepth 1 -type f -name '[0-9][0-9][0-9][0-9]_*.down.sql' -print0)

if [[ "$failed" -eq 1 ]]; then
    exit 1
fi

echo "migrations OK: ${first} to ${last}, ${#numbers[@]} sequential, all paired"
