#!/usr/bin/env python3
"""
HCA Falcon service wrapper around ZKNox ETHFALCON pythonref.

Usage:
  keygen: produces the NTT-compacted public key for a given seed
    python falcon_service.py keygen <hex_seed>
    -> stdout JSON: {"pkCompact": [hex, ..., 32 items]}

  sign: produces salt, s2, and pkCompact for a given seed + message
    python falcon_service.py sign <hex_seed> <hex_message>
    -> stdout JSON: {"pkCompact": [...], "salt": "hex", "s2Compact": [...]}

The seed is the SHAKE seed used by sig_sol.py to deterministically derive
the ETHFALCON keypair. Identical seed → identical key → identical pkCompact.

This script lives outside the ETHFALCON submodule so it is tracked in the
main repo. It inserts the pythonref directory into sys.path at runtime
so the ZKNox signer modules can be imported.
"""
import json
import os
import sys

# Locate contracts/lib/ETHFALCON/pythonref relative to this file:
#   pqc-app/app/scripts/falcon_service.py  ->  ../contracts/lib/ETHFALCON/pythonref
_HERE = os.path.dirname(os.path.abspath(__file__))
_PYTHONREF = os.path.normpath(os.path.join(_HERE, "..", "contracts", "lib", "ETHFALCON", "pythonref"))
if _PYTHONREF not in sys.path:
    sys.path.insert(0, _PYTHONREF)

# Imports from ETHFALCON pythonref
from common import falcon_compact, q  # noqa: E402
from encoding import decompress  # noqa: E402
from falcon import HEAD_LEN, SALT_LEN, PublicKey, SecretKey  # noqa: E402
from keccak_prng import KeccakPRNG  # noqa: E402
from ntrugen import ntru_gen  # noqa: E402
from polyntt.poly import Poly  # noqa: E402
from shake import SHAKE  # noqa: E402

N = 512


def generate_keypair(seed: bytes):
    prng = SHAKE.new(seed)
    prng.flip()
    f, g, F, G = ntru_gen(N, randombytes=prng.read)
    sk = SecretKey(N, [f, g, F, G])
    pk = PublicKey(N, sk.h)
    pk_compact = falcon_compact(Poly(sk.h, q).ntt())
    return sk, pk, pk_compact


def sign_message(seed: bytes, msg: bytes):
    sk, pk, pk_compact = generate_keypair(seed)

    prng = SHAKE.new(seed + b"_sign")
    prng.flip()

    sig = sk.sign(msg, randombytes=prng.read, xof=KeccakPRNG)

    salt = sig[HEAD_LEN : HEAD_LEN + SALT_LEN]
    enc_s = sig[HEAD_LEN + SALT_LEN :]
    s2_raw = decompress(enc_s, sk.sig_bytelen - HEAD_LEN - SALT_LEN, sk.n)
    s2 = [elt % q for elt in s2_raw]
    s2_compact = falcon_compact(s2)

    assert pk.verify(msg, sig, xof=KeccakPRNG), "self-verification failed"

    return pk_compact, salt, s2_compact


def uint256_hex(n: int) -> str:
    return f"0x{n:064x}"


def to_uint256_list(xs) -> list:
    return [uint256_hex(x) for x in xs]


def main():
    if len(sys.argv) < 3:
        print("Usage: falcon_service.py <keygen|sign> <hex_seed> [hex_message]", file=sys.stderr)
        sys.exit(1)

    action = sys.argv[1]
    seed_hex = sys.argv[2]
    if seed_hex.startswith("0x"):
        seed_hex = seed_hex[2:]
    seed = bytes.fromhex(seed_hex)

    if action == "keygen":
        _, _, pk_compact = generate_keypair(seed)
        print(json.dumps({"pkCompact": to_uint256_list(pk_compact)}))
    elif action == "sign":
        if len(sys.argv) < 4:
            print("Usage: falcon_service.py sign <hex_seed> <hex_message>", file=sys.stderr)
            sys.exit(1)
        msg_hex = sys.argv[3]
        if msg_hex.startswith("0x"):
            msg_hex = msg_hex[2:]
        msg = bytes.fromhex(msg_hex)

        pk_compact, salt, s2_compact = sign_message(seed, msg)
        print(json.dumps({
            "pkCompact": to_uint256_list(pk_compact),
            "salt": "0x" + salt.hex(),
            "s2Compact": to_uint256_list(s2_compact),
        }))
    else:
        print(f"Unknown action: {action}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
