#!/usr/bin/env bash
# Verify deployed contracts are live and correctly wired
# Usage: ./scripts/verify.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env.local"
CAST="${CAST:-$HOME/.foundry/bin/cast}"

# Load .env.local
if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
else
  echo "Error: .env.local not found. Run ./scripts/deploy.sh first."
  exit 1
fi

RPC="${BASE_SEPOLIA_RPC_URL:-https://sepolia.base.org}"
FACTORY="$NEXT_PUBLIC_HCA_FACTORY"
LAMPORT="$NEXT_PUBLIC_LAMPORT_VERIFIER"
ECDSA="$NEXT_PUBLIC_ECDSA_VERIFIER"
FALCON="$NEXT_PUBLIC_FALCON_VERIFIER"

echo "=== Verifying contracts on Base Sepolia ==="
echo "RPC: $RPC"
echo ""

PASS=0
FAIL=0

check_code() {
  local addr="$1" name="$2"
  local size=$($CAST codesize "$addr" --rpc-url "$RPC" 2>/dev/null || echo "0")
  if [ "$size" -gt 0 ] 2>/dev/null; then
    echo "PASS: $name ($addr) — $size bytes"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name ($addr) — no code"
    FAIL=$((FAIL + 1))
  fi
}

check_code "$FACTORY" "HCAFactory"
check_code "$LAMPORT" "LamportVerifier"
check_code "$ECDSA" "ECDSAVerifier"

if [ "$FALCON" != "0x0000000000000000000000000000000000000000" ]; then
  check_code "$FALCON" "FalconVerifier"
else
  echo "SKIP: FalconVerifier (not deployed)"
fi

# Check factory references
echo ""
STORED_LAMPORT=$($CAST call "$FACTORY" "LAMPORT_VERIFIER()(address)" --rpc-url "$RPC")
STORED_EP=$($CAST call "$FACTORY" "ENTRY_POINT()(address)" --rpc-url "$RPC")

if [ "$STORED_LAMPORT" = "$LAMPORT" ]; then
  echo "PASS: Factory → LamportVerifier reference correct"
  PASS=$((PASS + 1))
else
  echo "FAIL: Factory → LamportVerifier mismatch (expected $LAMPORT, got $STORED_LAMPORT)"
  FAIL=$((FAIL + 1))
fi

if [ "$STORED_EP" = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789" ]; then
  echo "PASS: Factory → EntryPoint reference correct"
  PASS=$((PASS + 1))
else
  echo "FAIL: Factory → EntryPoint mismatch"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
