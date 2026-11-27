#!/usr/bin/env bash
# usage: full_run.sh <version> <seed>  — flags, experiments, 4×3000 visitors, results, oracle
set -euo pipefail
V=$1; SEED=$2
sed -i '' "s/^FLAG_VERSION=.*/FLAG_VERSION=$V/" .env
set -a; source .env; set +a
docker compose up -d --force-recreate && sleep 3
./scripts/create_flags.sh "$V"
for R in r1 r2 r3 r4; do
  read FID VID <<< $(python3 -c "import json;d=json.load(open('.ids/headline_${R}_${V}.json'));print(d['id'],d['variants'][0]['id'])")
  cat <<JSON | flagsmith api -X POST "api/v1/environments/$FS_ENV/experiments/" --input - > ".ids/exp_${R}_${V}.json"
{"feature": $FID, "name": "Cached Out $R $V",
 "hypothesis": "Headline B gets more headline_click than control (run $R; see EXPERIMENT.md)",
 "metrics": [{"metric": 1175, "expected_direction": "increase"}],
 "experiment_rollout": {"enabled": true, "rollout_percentage": 100,
   "feature_state_value": {"type": "string", "value": "control"},
   "multivariate_feature_state_values": [{"multivariate_feature_option": $VID, "percentage_allocation": 50}]}}
JSON
  EID=$(python3 -c "import json;print(json.load(open('.ids/exp_${R}_${V}.json'))['id'])"); echo $EID > ".ids/exp_${R}_${V}.id"
  flagsmith api -X POST "api/v1/environments/$FS_ENV/experiments/$EID/start/" > /dev/null
  echo "$R $V → experiment $EID"
done
docker compose logs app --tail 1
for R in r1 r2 r3 r4; do node bot/bot.js $R 3000 8 "$SEED"; done
sleep 90
./scripts/results.sh "$V"
python3 analysis/oracle.py "$V"
