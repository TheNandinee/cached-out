#!/usr/bin/env bash
set -euo pipefail
V=${1:-v0}
for r in r1 r2 r3 r4; do
  f="headline_${r}_${V}"
  flagsmith feature create "$f" --value control --enabled
  flagsmith feature variant add "$f" --value b --key b --weight 0
  flagsmith feature get "$f" --json > ".ids/$f.json"
done
