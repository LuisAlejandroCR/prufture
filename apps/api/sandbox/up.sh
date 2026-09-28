#!/usr/bin/env bash
# up.sh: a local phase 2 sandbox — an anvil fork of Base Sepolia (the real EAS contract and schema,
# no real funds), Redis, and the official OpenZeppelin Relayer locked to EAS. Anvil's public dev keys
# sign on the fork only; never reuse them on a real network. Stop with: docker rm -f anvil ozr
set -euo pipefail
cd "$(dirname "$0")"

FORK_URL="${FORK_URL:-https://sepolia.base.org}"
API_KEY="${OZ_SANDBOX_API_KEY:-prufture-sandbox-api-key-0123456789abcdef}"
PASS="sandbox-pass"
MNEMONIC="test test test test test test test test test test test junk"
FOUNDRY=ghcr.io/foundry-rs/foundry:latest
WORK="$(mktemp -d)"

docker rm -f anvil ozr >/dev/null 2>&1 || true
# Behind a TLS-inspecting proxy, set SANDBOX_CA_BUNDLE to its CA file so the fork can reach FORK_URL.
CA_ARGS=()
if [ -n "${SANDBOX_CA_BUNDLE:-}" ]; then CA_ARGS=(-v "$SANDBOX_CA_BUNDLE:/ca.crt:ro" -e SSL_CERT_FILE=/ca.crt); fi
docker run -d --name anvil --network host \
  -e HTTPS_PROXY="${HTTPS_PROXY:-}" -e NO_PROXY="${NO_PROXY:-}" "${CA_ARGS[@]}" \
  "$FOUNDRY" "anvil --fork-url $FORK_URL --chain-id 84532 --host 127.0.0.1 --port 8545 --silent" >/dev/null

# The relayer disables itself if its RPC is unreachable at start, so wait for the fork first.
for _ in $(seq 1 60); do
  curl -sf -m 2 -X POST http://127.0.0.1:8545 -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId"}' >/dev/null && break
  sleep 1
done

# Dev account 1 signs for the relayer; dev account 0 is left for the local-key adapter.
mkdir -p "$WORK/config/keys"
cp -r oz-relayer/config.json oz-relayer/networks "$WORK/config/"
KEY1=$(docker run --rm "$FOUNDRY" "cast wallet private-key --mnemonic '$MNEMONIC' --mnemonic-index 1")
docker run --rm --user root -v "$WORK/config/keys:/out" "$FOUNDRY" \
  "cast wallet import local-signer --private-key $KEY1 --unsafe-password $PASS --keystore-dir /out" >/dev/null
mv "$WORK/config/keys/local-signer" "$WORK/config/keys/local-signer.json"
chmod -R a+rX "$WORK"

if ! redis-cli ping >/dev/null 2>&1; then
  if command -v redis-server >/dev/null; then redis-server --port 6379 --save "" --daemonize yes >/dev/null
  else docker run -d --name redis --network host redis:7 >/dev/null; fi
fi

docker run -d --name ozr --network host \
  -e API_KEY="$API_KEY" -e KEYSTORE_PASSPHRASE="$PASS" -e REDIS_URL=redis://127.0.0.1:6379 \
  -e HOST=127.0.0.1 -e APP_PORT=8080 -v "$WORK/config:/app/config" \
  openzeppelin/openzeppelin-relayer:latest >/dev/null
for _ in $(seq 1 60); do curl -sf -m 2 http://127.0.0.1:8080/api/v1/health >/dev/null && break; sleep 1; done

KEY0=$(docker run --rm "$FOUNDRY" "cast wallet private-key --mnemonic '$MNEMONIC' --mnemonic-index 0")
cat <<ENV
# Sandbox up. Export these, then run from apps/api:
#   npm run submitter-sandbox -- openzeppelin-relayer
#   npm run submitter-sandbox -- local-key
#   npm run shadow-compare -- openzeppelin-relayer 5
export RPC_URL=http://127.0.0.1:8545 RPC_FALLBACK_URLS=
export EAS_SCHEMA_UID=0x32ea8508873b5fe8cff8a6cc9483655914e051d051f8d59c2e097b40cc9ef619
export RELAYER_PRIVATE_KEY=$KEY0
export OZ_RELAYER_URL=http://127.0.0.1:8080 OZ_RELAYER_ID=prufture-base-sepolia
export OZ_RELAYER_API_KEY=$API_KEY
export OZ_RELAYER_ADDRESS=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
ENV
