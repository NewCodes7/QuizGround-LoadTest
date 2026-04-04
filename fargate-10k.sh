#!/bin/bash
set -e

TARGET="${TARGET:-https://quizground.site:3333/game}"
WORKERS_COUNT="${WORKERS_COUNT:-10}"
CPU="${CPU:-2}"
MEMORY="${MEMORY:-4}"

if [ -z "$GAME_ID" ]; then
  echo "Error: GAME_ID is required"
  echo "Usage: GAME_ID=12345 npm run fargate:10k"
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
  ./game-scenario-10k.yml

rm -f "$ENV_FILE"
