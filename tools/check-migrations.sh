#!/usr/bin/env bash
#
# check-migrations.sh — Migration convention checker for this repository.
#
# Verifies migration files under the repository migration directory against
# MIGRATION_CONVENTION.md:
#   1. File naming:      NNN_verb_snake_case.sql
#   2. Numbering:        starts at 001, strictly incremental, no duplicates/skips
#   3. Header comment:   every file has `-- Migration NNN:`, `-- File:`, and
#                        `-- Date: YYYY-MM-DD HH:mm` (24h, minute precision)
#   4. Consistency:      `-- File:` matches the actual file name
#
# Usage:  ./check-migrations.sh [migration-dir]
# Exit:   0 = all checks passed, 1 = violations found
#
# The script only reads files; it never modifies them.

set -u

# Repository root detection: works whether this script lives in the repo root
# or in a <root>/tools/ subdirectory.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -d "$SCRIPT_DIR/supabase/migrations" ] || [ -d "$SCRIPT_DIR/db/migrations" ]; then
  ROOT="$SCRIPT_DIR"
elif [ -d "$(dirname "$SCRIPT_DIR")/supabase/migrations" ] || [ -d "$(dirname "$SCRIPT_DIR")/db/migrations" ]; then
  ROOT="$(dirname "$SCRIPT_DIR")"
else
  ROOT="$SCRIPT_DIR"
fi
DIR="${1:-}"

if [ -z "$DIR" ]; then
  if [ -d "$ROOT/supabase/migrations" ]; then
    DIR="$ROOT/supabase/migrations"
  elif [ -d "$ROOT/db/migrations" ]; then
    DIR="$ROOT/db/migrations"
  else
    echo "x No migration directory found (supabase/migrations or db/migrations)."
    exit 1
  fi
fi

if [ ! -d "$DIR" ]; then
  echo "x Migration directory not found: $DIR"
  exit 1
fi

FAIL=0
WARN=0

shopt -s nullglob
FILES=("$DIR"/*.sql)
shopt -u nullglob

if [ ${#FILES[@]} -eq 0 ]; then
  echo "i No migration files in $DIR"
  exit 0
fi

echo "Checking ${#FILES[@]} migration file(s) in $DIR"
echo

prev=0
first=1

for f in "${FILES[@]}"; do
  base="$(basename "$f")"
  issues=()
  warn_issues=()

  # --- 1. naming ---
  if [[ "$base" =~ ^([0-9]{3})_([a-z][a-z0-9_]*)\.sql$ ]]; then
    num="${BASH_REMATCH[1]}"
    name="${BASH_REMATCH[2]}"
  else
    issues+=("naming: expected NNN_snake_case.sql")
    num=""
    name=""
  fi

  # --- 2. numbering ---
  if [ -n "$num" ]; then
    n=$((10#$num))
    if [ "$first" -eq 1 ]; then
      if [ "$n" -ne 1 ]; then
        issues+=("numbering: first file must be 001, got ${num}")
      fi
      first=0
    else
      if [ "$n" -le "$prev" ]; then
        issues+=("numbering: ${num} is not strictly after previous ${prev} (duplicate or out of order)")
      elif [ "$n" -ne $((prev + 1)) ]; then
        issues+=("numbering: skip detected (${prev} -> ${num}), expected $((prev + 1))")
      fi
    fi
    prev="$n"
  fi

  # --- 3. header comment (first 12 lines) ---
  hdr="$(head -n 12 "$f")"

  if ! grep -q -- "-- Migration" <<<"$hdr"; then
    issues+=("header: missing '-- Migration NNN:' line")
  fi

  if ! grep -qE -- "-- Date: [0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}" <<<"$hdr"; then
    issues+=("header: missing or malformed '-- Date: YYYY-MM-DD HH:mm'")
  fi

  fileline="$(grep -m1 -- "-- File:" <<<"$hdr" || true)"
  if [ -z "$fileline" ]; then
    issues+=("header: missing '-- File:' line")
  else
    declared="$(sed -E 's/^.*-- File:[[:space:]]*//' <<<"$fileline")"
    if [ "$declared" != "$base" ]; then
      issues+=("header: '-- File:' is '$declared', expected '$base'")
    fi
  fi

  # --- verb-first warning (non-blocking) ---
  if [ -n "$name" ]; then
    verb="$(printf '%s' "$name" | cut -d_ -f1)"
    case "$verb" in
      create|add|alter|fix|drop|set|update|rename|delete|migrate) ;;
      *) warn_issues+=("warning: description should start with a verb (got '$verb')"); WARN=$((WARN+1));;
    esac
  fi

  # --- report ---
  if [ ${#issues[@]} -gt 0 ]; then
    echo "x $base"
    for i in "${issues[@]}"; do
      echo "    - $i"
    done
    FAIL=$((FAIL+1))
  elif [ ${#warn_issues[@]} -gt 0 ]; then
    for w in "${warn_issues[@]}"; do
      echo "    - $w"
    done
  fi
done

echo
if [ "$FAIL" -eq 0 ]; then
  echo "OK  All ${#FILES[@]} migration file(s) pass (${WARN} warning(s))."
  exit 0
else
  echo "x ${FAIL} file(s) with violations."
  exit 1
fi
