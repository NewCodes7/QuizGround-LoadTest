#!/bin/bash
set -e

TARGET="http://34.158.197.135/game"
WORKERS_COUNT="${WORKERS_COUNT:-1}"
CPU="${CPU:-1}"
MEMORY="${MEMORY:-2}"

if [ -z "$GAME_ID" ]; then
  echo "Error: GAME_ID is required"
  echo "Usage: GAME_ID=12345 npm run fargate:10"
  exit 1
fi

ENV_FILE=$(mktemp /tmp/.env.artillery.XXXXXX)
echo "TARGET=$TARGET" > "$ENV_FILE"
echo "GAME_ID=$GAME_ID" >> "$ENV_FILE"

SPOT_FLAG=""
if [ "${SPOT:-1}" = "1" ]; then
  SPOT_FLAG="--spot"
fi

echo ">> TARGET=$TARGET"
echo ">> GAME_ID=$GAME_ID"
echo ">> WORKERS_COUNT=$WORKERS_COUNT, CPU=$CPU, MEMORY=$MEMORY"

artillery run-fargate \
  --region ap-northeast-2 \
  --count "$WORKERS_COUNT" \
  --cpu "$CPU" \
  --memory "$MEMORY" \
  $SPOT_FLAG \
  --dotenv "$ENV_FILE" \
  ./game-scenario-10.yml

rm -f "$ENV_FILE"
