#!/usr/bin/env bash
# usage: results.sh <version>   — refresh (max once/5 min/experiment) then save each run's results
set -euo pipefail
V=${1:-v0}; mkdir -p results
for R in r1 r2 r3 r4; do
  EID=$(cat ".ids/exp_${R}_${V}.id")
  flagsmith api -X POST "api/v1/environments/$FS_ENV/experiments/$EID/results/refresh/" > /dev/null 2>&1 || echo "$R: refresh skipped (rate limit?)"
done
sleep 75
for R in r1 r2 r3 r4; do
  EID=$(cat ".ids/exp_${R}_${V}.id")
  flagsmith api "api/v1/environments/$FS_ENV/experiments/$EID/results/" > "results/${R}_${V}.json"
done
echo saved
