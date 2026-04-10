#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-}"
TARGET="${2:-}"
RPC="${3:-}"

if [ -z "$MODE" ] || [ -z "$TARGET" ] || [ -z "$RPC" ]; then
  echo "Usage: bash ./scripts/check-falcon.sh <engine|verifier> <address> <rpc-url>" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PYTHON="${PYTHON:-$PROJECT_DIR/contracts/lib/ETHFALCON/pythonref/myenv/bin/python}"
CAST="${CAST:-$HOME/.foundry/bin/cast}"
SERVICE="$PROJECT_DIR/scripts/falcon_service.py"

if [ ! -x "$PYTHON" ]; then
  echo "ERROR: Falcon python env not found at $PYTHON" >&2
  echo "Run ./scripts/setup-falcon.sh first, or skip Falcon support." >&2
  exit 1
fi

if [ ! -x "$CAST" ]; then
  echo "ERROR: cast not found at $CAST" >&2
  exit 1
fi

TMP_JSON="$(mktemp)"
trap 'rm -f "$TMP_JSON"' EXIT

# Known-good ETHFALCON vector source:
#   seed = 0x11 repeated 48 bytes
#   msg  = 0xCC repeated 32 bytes
# This matches contracts/test/FalconE2E.t.sol.
MSG="0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
SEED="0x$(python3 - <<'PY'
print('11' * 48)
PY
)"

"$PYTHON" "$SERVICE" sign "${SEED#0x}" "${MSG#0x}" > "$TMP_JSON"

if [ "$MODE" = "engine" ]; then
  RESULT="$(python3 - "$TMP_JSON" "$CAST" "$TARGET" "$RPC" "$MSG" <<'PY'
import json
import subprocess
import sys
from pathlib import Path

data = json.loads(Path(sys.argv[1]).read_text())
cast = sys.argv[2]
target = sys.argv[3]
rpc = sys.argv[4]
msg = sys.argv[5]
s2 = '[' + ','.join(data['s2Compact']) + ']'
pk = '[' + ','.join(data['pkCompact']) + ']'
result = subprocess.check_output(
    [cast, 'call', target, 'verify(bytes,bytes,uint256[],uint256[])(bool)', msg, data['salt'], s2, pk, '--rpc-url', rpc],
    text=True,
).strip()
print(result)
PY
)"
elif [ "$MODE" = "verifier" ]; then
  RESULT="$(python3 - "$TMP_JSON" "$CAST" "$TARGET" "$RPC" "$MSG" <<'PY'
import json
import subprocess
import sys
from pathlib import Path

data = json.loads(Path(sys.argv[1]).read_text())
cast = sys.argv[2]
target = sys.argv[3]
rpc = sys.argv[4]
msg = sys.argv[5]
s2 = '[' + ','.join(data['s2Compact']) + ']'
pk = '[' + ','.join(data['pkCompact']) + ']'
sigdata = subprocess.check_output(
    [cast, 'abi-encode', 'f(bytes,uint256[],uint256[])', data['salt'], s2, pk],
    text=True,
).strip()
result = subprocess.check_output(
    [cast, 'call', target, 'verify(bytes32,bytes)(bool)', msg, sigdata, '--rpc-url', rpc],
    text=True,
).strip()
print(result)
PY
)"
else
  echo "ERROR: mode must be 'engine' or 'verifier'" >&2
  exit 1
fi

if [ "$RESULT" = "true" ]; then
  echo "PASS"
  exit 0
fi

echo "FAIL"
exit 1
