#!/usr/bin/env bash
# Deploy HCA contracts to Base Sepolia and write addresses to .env.local
# Usage: ./scripts/deploy.sh
# Requires: PRIVATE_KEY and BASE_SEPOLIA_RPC_URL set in environment or .env.local
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
: "${BASE_SEPOLIA_RPC_URL:?Set BASE_SEPOLIA_RPC_URL in .env.local or environment}"

SENDER=$($CAST wallet address --private-key "$PRIVATE_KEY")
echo "Deployer: $SENDER"
echo "RPC: $BASE_SEPOLIA_RPC_URL"
echo ""

# Deploy
cd "$CONTRACTS_DIR"
OUTPUT=$($FORGE script script/DeployHCA.s.sol \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --broadcast \
  --sender "$SENDER" \
  --private-key "$PRIVATE_KEY" 2>&1)

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
