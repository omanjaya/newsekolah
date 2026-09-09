#!/usr/bin/env bash
# Fails if any tracked-looking file outside reference/ and node_modules
# contains a pictographic emoji character (CLAUDE.md: "Tidak ada emoji di UI,
# kode, komentar, commit, dokumen"). Used by .github/workflows/ci.yml
# (emoji-check job) and can be run locally.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

# Directories never scanned: reference/ is an unmodified upstream snapshot,
# .claude/ is vendored Claude Code tooling/skill config (skill docs
# intentionally show emoji as counter-examples), the rest are dependency or
# build output that is never hand-written.
EXCLUDE_DIR_PATTERN='(^|/)(\.git|\.claude|reference|node_modules|dist|\.next|\.turbo|coverage|storybook-static|\.expo|ios|android)(/|$)'

# Binary files can contain byte sequences that a naive codepoint scan
# misreads as emoji; skip by extension instead of trying to sniff content.
BINARY_EXT_PATTERN='\.(png|jpe?g|gif|ico|webp|pdf|woff2?|ttf|otf|eot|zip|gz|tar|mp4|mp3|wasm|so|dylib|dll|exe|bin|db|sqlite3?|ttc)$'

# Characters with default emoji presentation (real pictographic emoji, e.g.
# rocket/checkmark-box/fire), regional indicator pairs (flag emoji), and the
# emoji variation selector (forces emoji style on an otherwise text glyph).
# Deliberately narrower than "any dingbat": plain text symbols like U+2713
# (check mark) or U+2192 (arrow) are not emoji and are used as plain glyphs
# in project docs (see docs/07-ui-ux.md).
EMOJI_PATTERN='[\x{1F1E6}-\x{1F1FF}]|\p{Emoji_Presentation}|\x{FE0F}'

found=0

while IFS= read -r -d '' path; do
    rel="${path#./}"
    [[ "$rel" =~ $EXCLUDE_DIR_PATTERN ]] && continue
    [[ "$rel" =~ $BINARY_EXT_PATTERN ]] && continue

    if perl -CSD -ne "exit 1 if /$EMOJI_PATTERN/" "$rel" 2>/dev/null; then
        continue
    fi
    echo "emoji found: $rel"
    found=1
done < <(find . -type f -print0)

if [[ "$found" -eq 1 ]]; then
    echo "error: remove emoji from the files listed above" >&2
    exit 1
fi

echo "no emoji found"
