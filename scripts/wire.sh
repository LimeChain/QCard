#!/usr/bin/env bash
# Write deployed contract addresses to .env.local
# Usage: ./scripts/wire.sh <factory> <lamport> <ecdsa> <falcon>
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$(cd "$SCRIPT_DIR/.." && pwd)/.env.local"

FACTORY="${1:?Usage: wire.sh <factory> <lamport> <ecdsa> <falcon>}"
LAMPORT="${2:?Usage: wire.sh <factory> <lamport> <ecdsa> <falcon>}"
ECDSA="${3:?Usage: wire.sh <factory> <lamport> <ecdsa> <falcon>}"
FALCON="${4:-0x0000000000000000000000000000000000000000}"

# Preserve existing non-address vars
PIMLICO_KEY=""
PRIVATE_KEY_VAL=""
RPC_URL=""
FALCON_ENGINE_VAL=""
if [ -f "$ENV_FILE" ]; then
  PIMLICO_KEY=$(grep "^NEXT_PUBLIC_PIMLICO_API_KEY=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- || true)
  PRIVATE_KEY_VAL=$(grep "^PRIVATE_KEY=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- || true)
  RPC_URL=$(grep "^SEPOLIA_RPC_URL=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- || true)
  FALCON_ENGINE_VAL=$(grep "^FALCON_ENGINE=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- || true)
fi

cat > "$ENV_FILE" << EOF
NEXT_PUBLIC_HCA_FACTORY=$FACTORY
NEXT_PUBLIC_LAMPORT_VERIFIER=$LAMPORT
NEXT_PUBLIC_ECDSA_VERIFIER=$ECDSA
NEXT_PUBLIC_FALCON_VERIFIER=$FALCON
NEXT_PUBLIC_PIMLICO_API_KEY=$PIMLICO_KEY
EOF

# Preserve deploy vars if they existed
[ -n "$PRIVATE_KEY_VAL" ] && echo "PRIVATE_KEY=$PRIVATE_KEY_VAL" >> "$ENV_FILE"
[ -n "$RPC_URL" ] && echo "SEPOLIA_RPC_URL=$RPC_URL" >> "$ENV_FILE"
[ -n "$FALCON_ENGINE_VAL" ] && echo "FALCON_ENGINE=$FALCON_ENGINE_VAL" >> "$ENV_FILE"

echo "Wrote to $ENV_FILE:"
echo "  Factory:  $FACTORY"
echo "  Lamport:  $LAMPORT"
echo "  ECDSA:    $ECDSA"
echo "  Falcon:   $FALCON"
