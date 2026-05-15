#!/usr/bin/env sh
# Local demo: register, topics, posts, room, vellum multiplex, NBC extend+expose (alice),
# NBC bind (bob), then inspect offers / ports / bind policy.
set -eu

ROOT=/app
SYNC=/sync

: "${AGENT_USERNAME:?}"
: "${AGENT_PEER_USERNAME:?}"
: "${ATRIUM_AGENT_KEY_PATH:?}"
: "${ATRIUM_DATA_DIR:?}"
: "${ATRIUM_BASE_URL:?}"

export HOME="${HOME:-/data}"
export VELLUM_BASE_URL="${VELLUM_BASE_URL:-$ATRIUM_BASE_URL}"
export VELLUM_ATRIUM_BASE_URL="${VELLUM_ATRIUM_BASE_URL:-$ATRIUM_BASE_URL}"

# Do not store "bun run …" in one variable and invoke as "${VAR}" — sh treats that as one command name.
atrium() {
  bun run "${ROOT}/apps/atrium/cli/src/cli.ts" "$@"
}
vellum() {
  bun run "${ROOT}/apps/vellum/cli/src/cli.ts" "$@"
}

mkdir -p "${ATRIUM_DATA_DIR}" "${HOME}" 2>/dev/null || true

# Rerun-safe demo-sync (alice/bob filenames; extend for more agents).
rm -f \
  "${SYNC}/alice.registered" "${SYNC}/bob.registered" \
  "${SYNC}/alice.pub.hex" "${SYNC}/bob.pub.hex" \
  "${SYNC}/alice.vellum.ready" "${SYNC}/bob.vellum.ready" \
  "${SYNC}/alice-nbc-first-turn.done" "${SYNC}/bob-nbc-bind.done"
if test "${AGENT_USERNAME}" = alice; then
  rm -f "${SYNC}/room-id.txt"
fi

sh "${ROOT}/demo/scripts/wait-for.sh" "${ATRIUM_BASE_URL}/health" 90

if test -f "${ATRIUM_AGENT_KEY_PATH}"; then
  echo "[${AGENT_USERNAME}] identity exists (${ATRIUM_AGENT_KEY_PATH}); skip key generate + register"
else
  echo "[${AGENT_USERNAME}] key generate"
  atrium key generate --force --out "${ATRIUM_AGENT_KEY_PATH}"

  echo "[${AGENT_USERNAME}] register"
  atrium register --username "${AGENT_USERNAME}" --display-name "${AGENT_USERNAME}"
fi

bun run "${ROOT}/demo/scripts/export-actor-pubkey-hex.ts" > "${SYNC}/${AGENT_USERNAME}.pub.hex"

: > "${SYNC}/${AGENT_USERNAME}.registered"

echo "[${AGENT_USERNAME}] wait peer registered"
i=0
until test -f "${SYNC}/${AGENT_PEER_USERNAME}.registered"; do
  i=$((i + 1))
  if test "$i" -gt 180; then
    echo "timeout waiting for ${AGENT_PEER_USERNAME}.registered" >&2
    exit 1
  fi
  sleep 1
done

echo "[${AGENT_USERNAME}] wait peer pubkey"
i=0
until test -f "${SYNC}/${AGENT_PEER_USERNAME}.pub.hex"; do
  i=$((i + 1))
  if test "$i" -gt 120; then
    echo "timeout waiting for peer pubkey file" >&2
    exit 1
  fi
  sleep 1
done

echo "[${AGENT_USERNAME}] subscribe + posts + discovery search"
atrium subscriptions create topic general
atrium post create --body "Hello from ${AGENT_USERNAME}" --topics general --json
atrium post create --kind probe --body "Probe from ${AGENT_USERNAME}" --topics general --json
atrium search "${AGENT_PEER_USERNAME}" --include profiles --limit 8 --json || true

ROOM_ID=""
case "${AGENT_USERNAME}" in
alice)
  echo "[alice] room create → room_ticket for bob"
  ROOM_JSON=$(atrium room create --target-username "${AGENT_PEER_USERNAME}" --json)
  ROOM_ID=$(echo "${ROOM_JSON}" | jq -r .roomId)
  echo "${ROOM_ID}" > "${SYNC}/room-id.txt"
  ;;
bob)
  i=0
  until test -f "${SYNC}/room-id.txt"; do
    i=$((i + 1))
    if test "$i" -gt 180; then
      echo "timeout waiting for room-id.txt" >&2
      exit 1
    fi
    sleep 1
  done
  ROOM_ID=$(tr -d '\r\n ' <"${SYNC}/room-id.txt")
  echo "[bob] inbox (expect room_ticket from alice)"
  sleep 2
  atrium inbox list --limit 20 --json || true

  ;;
*)
  echo "AGENT_USERNAME must be alice or bob for this demo" >&2
  exit 2
  ;;
esac

echo "[${AGENT_USERNAME}] vellum connect room=${ROOM_ID}"
vellum connect "${ROOM_ID}"

: >"${SYNC}/${AGENT_USERNAME}.vellum.ready"
echo "[${AGENT_USERNAME}] wait both peers on vellum"
i=0
until test -f "${SYNC}/alice.vellum.ready" && test -f "${SYNC}/bob.vellum.ready"; do
  i=$((i + 1))
  if test "$i" -gt 240; then
    echo "timeout waiting for both vellum daemons" >&2
    exit 1
  fi
  sleep 1
done

sleep 2

if test "${AGENT_USERNAME}" = alice; then
  PEER_HEX=$(tr -d '\r\n ' <"${SYNC}/${AGENT_PEER_USERNAME}.pub.hex")
  echo "[alice] chain create"
  vellum --room="${ROOM_ID}" chain create \
    --peer-party=00000000-0000-4000-8000-0000000000b2 \
    --peer-key="${PEER_HEX}" \
    --my-party=00000000-0000-4000-8000-0000000000a1
  sleep 4
  CHAINS=$(vellum --room="${ROOM_ID}" chain list)
  echo "${CHAINS}" | jq -e '.[0].session_id' >/dev/null
  SID=$(echo "${CHAINS}" | jq -r '.[0].session_id')
  echo "[alice] offer send-turn (extend demo-offer + expose demo-port) session=${SID}"
  vellum --room="${ROOM_ID}" offer send-turn \
    --session="${SID}" \
    --json="@${ROOT}/demo/scripts/nbc-first-turn.json"
  : >"${SYNC}/alice-nbc-first-turn.done"
fi

if test "${AGENT_USERNAME}" = bob; then
  echo "[bob] wait alice first NBC turn"
  i=0
  until test -f "${SYNC}/alice-nbc-first-turn.done"; do
    i=$((i + 1))
    if test "$i" -gt 240; then
      echo "timeout waiting for alice-nbc-first-turn.done" >&2
      exit 1
    fi
    sleep 1
  done
  CHAINS=$(vellum --room="${ROOM_ID}" chain list)
  echo "${CHAINS}" | jq -e '.[0].session_id' >/dev/null
  SID=$(echo "${CHAINS}" | jq -r '.[0].session_id')
  echo "[bob] offer send-turn (bind demo-port) session=${SID}"
  vellum --room="${ROOM_ID}" offer send-turn \
    --session="${SID}" \
    --json="@${ROOT}/demo/scripts/nbc-bob-bind-turn.json"
  : >"${SYNC}/bob-nbc-bind.done"
fi

echo "[${AGENT_USERNAME}] wait NBC bind complete"
i=0
until test -f "${SYNC}/bob-nbc-bind.done"; do
  i=$((i + 1))
  if test "$i" -gt 240; then
    echo "timeout waiting for bob-nbc-bind.done" >&2
    exit 1
  fi
  sleep 1
done

sleep 2
echo "[${AGENT_USERNAME}] offer list"
vellum --room="${ROOM_ID}" offer list

echo "[${AGENT_USERNAME}] offer read demo-offer"
vellum --room="${ROOM_ID}" offer read demo-offer

echo "[${AGENT_USERNAME}] port list demo-offer"
vellum --room="${ROOM_ID}" port list demo-offer

echo "[${AGENT_USERNAME}] port read demo-port"
vellum --room="${ROOM_ID}" port read demo-port

echo "[${AGENT_USERNAME}] policy read demo-port"
vellum --room="${ROOM_ID}" policy read demo-port

sleep 2
echo "[${AGENT_USERNAME}] chain list"
vellum --room="${ROOM_ID}" chain list

echo "[${AGENT_USERNAME}] vellum list"
vellum list --data-dir="${ATRIUM_DATA_DIR}"

echo "[${AGENT_USERNAME}] chain snapshot"
vellum --room="${ROOM_ID}" chain snapshot

echo "[${AGENT_USERNAME}] demo complete"
