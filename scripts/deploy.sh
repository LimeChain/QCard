#!/usr/bin/env bash
# Deploy HCA contracts to Sepolia and write addresses to .env.local
# Usage: ./scripts/deploy.sh
# Requires: PRIVATE_KEY and SEPOLIA_RPC_URL set in environment or .env.local
# Optional: FALCON_ENGINE — address of a pre-deployed ZKNOX_ethfalcon on-chain.
#           If unset, defaults to the ZKNox deployment on Sepolia.
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

# Default FALCON_ENGINE to the ZKNox ETHFALCON engine on Sepolia
# (the address that was wired into the original deployment on this network)
: "${FALCON_ENGINE:=0x01880eb770be007aE75febabA21532Fb5c33318B}"
export FALCON_ENGINE

SENDER=$($CAST wallet address --private-key "$PRIVATE_KEY")
echo "Deployer:     $SENDER"
echo "RPC:          $SEPOLIA_RPC_URL"
echo "Falcon engine: $FALCON_ENGINE"
echo ""

# Sanity-check that the Falcon engine actually exists on the target chain
ENGINE_CODE=$($CAST code "$FALCON_ENGINE" --rpc-url "$SEPOLIA_RPC_URL")
if [ "$ENGINE_CODE" = "0x" ] || [ -z "$ENGINE_CODE" ]; then
  echo "ERROR: No contract code at $FALCON_ENGINE on $SEPOLIA_RPC_URL."
  echo "Deploy ZKNOX_ethfalcon first, or unset FALCON_ENGINE to skip Falcon support."
  exit 1
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

echo ""
echo "=== Writing to $ENV_FILE ==="

# Write/update .env.local
cd "$PROJECT_DIR"
./scripts/wire.sh "$FACTORY" "$LAMPORT" "$ECDSA" "$FALCON"

echo ""
echo "Done. Run 'npm run dev' to start the app."
