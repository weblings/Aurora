#!/bin/bash
# Guard for docs/lessons filing rules (see lessons/README.md).
# Enforces the retrieval contract: every entry carries Tags: and
# Applies-when: lines, and the README index counts match reality.
# Exit 1 on any failure, so it works as a pre-commit hook or CI step.
# (Deliberately no entry-count split rule: files subdivide when their
# query vocabulary gets muddy, not at an arbitrary count.)
set -u
fail=0
cd "$(dirname "$0")"
for f in lessons/*.md; do
  case "$f" in */README.md) continue;; esac
  base=$(basename "$f")
  # Every ## entry must be followed by Tags: then Applies-when:
  bad=$(awk '/^## /{h=NR; next} h && NR==h+1 && !/^Tags: /{print h": missing Tags:"; h=0; next} h && NR==h+2 && !/^Applies-when: /{print h": missing Applies-when:"; h=0}' "$f")
  if [ -n "$bad" ]; then
    echo "$bad" | sed "s/^/TAGS: $base /"
    fail=1
  fi
  entries=$(grep -c '^## ' "$f")
  indexed=$(grep -E "^\| \[$base\]" lessons/README.md | awk -F'|' '{gsub(/ /,"",$4); print $4}')
  if [ -n "$indexed" ] && [ "$indexed" != "$entries" ]; then
    echo "COUNT: lessons/README.md says $indexed for $base, actually $entries"
    fail=1
  fi
done
[ "$fail" -eq 0 ] && echo "lessons OK"
exit "$fail"
