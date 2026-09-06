#!/usr/bin/env bash
set -euo pipefail

topic="${1:-session}"
if [[ ! "$topic" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  printf 'Topic must use lowercase letters, digits, and hyphens.\n' >&2
  exit 2
fi

context_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$context_dir/$timestamp-$topic.md"

if [[ -e "$target" ]]; then
  printf 'Context file already exists: %s\n' "$target" >&2
  exit 1
fi

cp "$context_dir/SESSION_TEMPLATE.md" "$target"
printf 'Created %s\n' "$target"
