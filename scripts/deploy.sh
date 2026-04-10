#!/usr/bin/env bash
# Deploy HCA contracts to Sepolia and write addresses to .env.local
# Usage: ./scripts/deploy.sh
# Requires: PRIVATE_KEY and SEPOLIA_RPC_URL set in environment or .env.local
# Optional: FALCON_ENGINE — address of a pre-deployed ZKNOX_ethfalcon on-chain.
# Behavior:
#   - unset: deploy a fresh ETHFALCON engine first
#   - zero address: skip Falcon support entirely
#   - non-zero address: reuse that engine after self-test
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONTRACTS_DIR="$PROJECT_DIR/contracts"
ENV_FILE="$PROJECT_DIR/.env.local"
FORGE="${FORGE:-$HOME/.foundry/bin/forge}"
CAST="${CAST:-$HOME/.foundry/bin/cast}"

# Load .env.local if it exists
if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

# Check required vars
: "${PRIVATE_KEY:?Set PRIVATE_KEY in .env.local or environment}"
: "${SEPOLIA_RPC_URL:?Set SEPOLIA_RPC_URL in .env.local or environment}"

SENDER=$($CAST wallet address --private-key "$PRIVATE_KEY")
echo "Deployer:     $SENDER"
echo "RPC:          $SEPOLIA_RPC_URL"
echo "Falcon engine: ${FALCON_ENGINE:-AUTO-DEPLOY}"
echo ""

if [ -z "${FALCON_ENGINE:-}" ]; then
  echo "Deploying Falcon engine..."
  cd "$CONTRACTS_DIR"
  ENGINE_OUTPUT=$($FORGE script script/DeployFalconEngine.s.sol \
    --rpc-url "$SEPOLIA_RPC_URL" \
    --broadcast \
    --sender "$SENDER" \
    --private-key "$PRIVATE_KEY" \
    --via-ir 2>&1)

  echo "$ENGINE_OUTPUT"
  FALCON_ENGINE=$(echo "$ENGINE_OUTPUT" | grep "FalconEngine:" | awk '{print $2}')
  if [ -z "$FALCON_ENGINE" ]; then
    echo "ERROR: Failed to parse Falcon engine address from deployment output."
    exit 1
  fi
fi

if [ -n "${FALCON_ENGINE:-}" ] && [ "${FALCON_ENGINE}" != "0x0000000000000000000000000000000000000000" ]; then
  export FALCON_ENGINE

  # Sanity-check that the Falcon engine actually exists on the target chain
  ENGINE_CODE=$($CAST code "$FALCON_ENGINE" --rpc-url "$SEPOLIA_RPC_URL")
  if [ "$ENGINE_CODE" = "0x" ] || [ -z "$ENGINE_CODE" ]; then
    echo "ERROR: No contract code at $FALCON_ENGINE on $SEPOLIA_RPC_URL."
    echo "Deploy ZKNOX_ethfalcon first, or unset FALCON_ENGINE to skip Falcon support."
    exit 1
  fi

  echo "Self-testing Falcon engine..."
  if ! bash "$PROJECT_DIR/scripts/check-falcon.sh" engine "$FALCON_ENGINE" "$SEPOLIA_RPC_URL"; then
    echo "ERROR: Falcon engine self-test failed at $FALCON_ENGINE."
    echo "The configured engine rejects a known-good ETHFALCON test vector."
    echo "Set FALCON_ENGINE to a verified deployment, or unset it to skip Falcon support."
    exit 1
  fi
fi

# Deploy (forge script with --via-ir, required by the DebugValidation / BedrockFalcon tests)
cd "$CONTRACTS_DIR"
OUTPUT=$($FORGE script script/DeployHCA.s.sol \
  --rpc-url "$SEPOLIA_RPC_URL" \
  --broadcast \
  --sender "$SENDER" \
  --private-key "$PRIVATE_KEY" \
  --via-ir 2>&1)

echo "$OUTPUT"

# Parse addresses from output
LAMPORT=$(echo "$OUTPUT" | grep "LamportVerifier:" | awk '{print $2}')
ECDSA=$(echo "$OUTPUT" | grep "ECDSAVerifier:" | awk '{print $2}')
FACTORY=$(echo "$OUTPUT" | grep "HCAFactory:" | awk '{print $2}')
FALCON=$(echo "$OUTPUT" | grep "FalconVerifier:" | awk '{print $2}')

# Handle skipped Falcon
if echo "$FALCON" | grep -q "SKIPPED"; then
  FALCON="0x0000000000000000000000000000000000000000"
fi

if [ "$FALCON" != "0x0000000000000000000000000000000000000000" ]; then
  echo "Self-testing deployed Falcon verifier..."
  if ! bash "$PROJECT_DIR/scripts/check-falcon.sh" verifier "$FALCON" "$SEPOLIA_RPC_URL"; then
    echo "ERROR: Newly deployed FalconVerifier failed self-test at $FALCON."
    echo "The wrapper or engine wiring is not producing verifiable signatures."
    exit 1
  fi
fi

echo ""
echo "=== Writing to $ENV_FILE ==="

# Write/update .env.local
cd "$PROJECT_DIR"
./scripts/wire.sh "$FACTORY" "$LAMPORT" "$ECDSA" "$FALCON" "${FALCON_ENGINE:-}"

echo ""
echo "Done. Run 'npm run dev' to start the app."
