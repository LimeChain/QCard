#!/usr/bin/env bash
# Sets up the Python environment used by /api/falcon/{keygen,sign}
# and by Falcon deployment self-tests in ./scripts/deploy.sh.
# Run this once after cloning the repo before using Falcon support.
#
# Requires: python3, uv (https://docs.astral.sh/uv/)

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
APP_ROOT="$(cd "$HERE/.." && pwd)"
PYTHONREF="$APP_ROOT/contracts/lib/ETHFALCON/pythonref"

if [ ! -d "$PYTHONREF" ]; then
  echo "ERROR: ETHFALCON submodule not found at $PYTHONREF"
  echo "Run: git submodule update --init --recursive"
  exit 1
fi

cd "$PYTHONREF"

if [ ! -d "myenv" ]; then
  echo "Creating Python venv at $PYTHONREF/myenv..."
  uv venv myenv
fi

echo "Installing ETHFALCON pythonref dependencies..."
uv pip install --python myenv/bin/python eth_abi pycryptodome scipy
uv pip install --python myenv/bin/python \
  "git+https://github.com/ZKNoxHQ/NTT.git@main#egg=polyntt&subdirectory=assets/pythonref/"

echo
echo "Smoke test:"
"$APP_ROOT/contracts/lib/ETHFALCON/pythonref/myenv/bin/python" \
  "$APP_ROOT/scripts/falcon_service.py" keygen \
  "0000000000000000000000000000000000000000000000000000000000000000" \
  | python3 -c "import sys, json; d = json.loads(sys.stdin.read()); print('  pkCompact[0]:', d['pkCompact'][0])"

echo
echo "Falcon backend ready. /api/falcon/keygen and /api/falcon/sign should now work."
