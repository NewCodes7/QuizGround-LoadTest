#!/bin/bash
set -e

NODE1_URL="${NODE1_URL:-http://34.64.246.135:1027}"
NODE2_URL="${NODE2_URL:-http://34.22.81.144:1027}"
TARGET="${TARGET:-${NODE1_URL}/game}"
WORKERS_COUNT="${WORKERS_COUNT:-2}"
CPU="${CPU:-1}"
MEMORY="${MEMORY:-2}"
SCENARIO="${SCENARIO:-./game-scenario.yml}"

if [ -z "$GAME_ID" ]; then
  echo "Error: GAME_ID is required"
  echo "Usage: GAME_ID=12345 WORKERS_COUNT=2 SCENARIO=./game-scenario.yml bash fargate.sh"
  exit 1
fi

ENV_FILE=$(mktemp /tmp/.env.artillery.XXXXXX)
echo "TARGET=$TARGET" > "$ENV_FILE"
echo "GAME_ID=$GAME_ID" >> "$ENV_FILE"
echo "NODE1_URL=$NODE1_URL" >> "$ENV_FILE"
echo "NODE2_URL=$NODE2_URL" >> "$ENV_FILE"

SPOT_FLAG=""
if [ "${SPOT:-1}" = "1" ]; then
  SPOT_FLAG="--spot"
fi

echo ">> SCENARIO=$SCENARIO"
echo ">> TARGET=$TARGET"
echo ">> NODE1_URL=$NODE1_URL"
echo ">> NODE2_URL=$NODE2_URL"
echo ">> GAME_ID=$GAME_ID"
echo ">> WORKERS_COUNT=$WORKERS_COUNT, CPU=$CPU, MEMORY=$MEMORY"

artillery run-fargate \
  --region ap-northeast-2 \
  --count "$WORKERS_COUNT" \
  --cpu "$CPU" \
  --memory "$MEMORY" \
  $SPOT_FLAG \
  --dotenv "$ENV_FILE" \
  "$SCENARIO"

rm -f "$ENV_FILE"
