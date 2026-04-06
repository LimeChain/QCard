"""
Lamport Account Signer — Off-chain key generation + signing for the ERC-4337 PoC.

Usage:
    python signer/lamport_signer.py genkeys --seed "my-secret-seed" --leaf-count 16
    python signer/lamport_signer.py pubroot --seed "my-secret-seed" --leaf-count 16
    python signer/lamport_signer.py sign --seed "my-secret-seed" --message "0xabcdef..." --leaf-index 0 --leaf-count 16

Requirements:
    pip install pycryptodome
"""

from __future__ import annotations

import argparse
import json
from typing import Sequence

try:
    from Crypto.Hash import keccak as _keccak_mod

    def keccak256(data: bytes) -> bytes:
        """Keccak-256 (EVM-compatible, not SHA3-256)."""
        h = _keccak_mod.new(digest_bits=256)
        h.update(data)
        return h.digest()

except ImportError:
    try:
        import sha3

        def keccak256(data: bytes) -> bytes:
            return sha3.keccak_256(data).digest()

    except ImportError as exc:
        raise ImportError(
            "Install pycryptodome or pysha3 for Keccak-256:\n"
            "  pip install pycryptodome\n"
            "  # or: pip install pysha3"
        ) from exc


def to_hex(value: bytes) -> str:
    return "0x" + value.hex()


def parse_bytes32(value: str) -> bytes:
    raw = bytes.fromhex(value.removeprefix("0x"))
    if len(raw) != 32:
        raise ValueError(f"expected 32-byte hex value, got {len(raw)} bytes")
    return raw


def require_power_of_two(value: int, flag_name: str) -> None:
    if value <= 0 or value & (value - 1):
        raise ValueError(f"{flag_name} must be a positive power of two, got {value}")


def derive_private_key(seed_bytes: bytes, index: int) -> bytes:
    """Match Solidity: keccak256(abi.encodePacked(bytes32(seed), uint256(index)))."""
    return keccak256(seed_bytes + index.to_bytes(32, "big"))


def derive_master_seed(seed_str: str) -> bytes:
    """Match Solidity tests that start from keccak256("seed-string")."""
    return keccak256(seed_str.encode())


def derive_leaf_seed(master_seed: bytes, leaf_index: int) -> bytes:
    """Match Solidity: keccak256(abi.encodePacked(masterSeed, leafIndex))."""
    return keccak256(master_seed + leaf_index.to_bytes(32, "big"))


def generate_leaf_keypair(master_seed: bytes, leaf_index: int) -> tuple[list[bytes], list[bytes], bytes]:
    """Generate one Lamport keypair plus its leaf root for a given account leaf index."""
    leaf_seed = derive_leaf_seed(master_seed, leaf_index)
    private_keys: list[bytes] = []
    public_key_hashes: list[bytes] = []

    for i in range(512):
        private_key = derive_private_key(leaf_seed, i)
        public_key_hash = keccak256(private_key)
        private_keys.append(private_key)
        public_key_hashes.append(public_key_hash)

    leaf_root = compute_merkle_root(public_key_hashes)
    return private_keys, public_key_hashes, leaf_root


def compute_merkle_root(leaves: Sequence[bytes]) -> bytes:
    """Compute a binary Merkle root using keccak256 over pairwise concatenation."""
    if not leaves:
        raise ValueError("at least one leaf is required")
    require_power_of_two(len(leaves), "leaf count")

    layer = list(leaves)
    while len(layer) > 1:
        next_layer: list[bytes] = []
        for i in range(0, len(layer), 2):
            next_layer.append(keccak256(layer[i] + layer[i + 1]))
        layer = next_layer
    return layer[0]


def build_merkle_proof(leaves: Sequence[bytes], leaf_index: int) -> list[bytes]:
    if not leaves:
        raise ValueError("at least one leaf is required")
    require_power_of_two(len(leaves), "leaf count")
    if leaf_index < 0 or leaf_index >= len(leaves):
        raise ValueError(f"leaf_index must be between 0 and {len(leaves) - 1}, got {leaf_index}")

    proof: list[bytes] = []
    layer = list(leaves)
    idx = leaf_index

    while len(layer) > 1:
        proof.append(layer[idx ^ 1])

        next_layer: list[bytes] = []
        for i in range(0, len(layer), 2):
            next_layer.append(keccak256(layer[i] + layer[i + 1]))
        layer = next_layer
        idx >>= 1

    return proof


def generate_account_roots(seed_str: str, leaf_count: int) -> tuple[bytes, list[bytes], bytes]:
    require_power_of_two(leaf_count, "--leaf-count")

    master_seed = derive_master_seed(seed_str)
    leaf_roots: list[bytes] = []

    for leaf_index in range(leaf_count):
        _, _, leaf_root = generate_leaf_keypair(master_seed, leaf_index)
        leaf_roots.append(leaf_root)

    account_root = compute_merkle_root(leaf_roots)
    return master_seed, leaf_roots, account_root


def sign_message(seed_str: str, msg_hash_hex: str, leaf_index: int, leaf_count: int) -> dict[str, object]:
    master_seed, leaf_roots, account_root = generate_account_roots(seed_str, leaf_count)
    msg_hash = parse_bytes32(msg_hash_hex)

    private_keys, public_key_hashes, leaf_root = generate_leaf_keypair(master_seed, leaf_index)
    proof = build_merkle_proof(leaf_roots, leaf_index)
    msg_int = int.from_bytes(msg_hash, "big")

    signature: list[bytes] = []
    for i in range(256):
        bit = (msg_int >> (255 - i)) & 1
        signature.append(private_keys[2 * i + bit])

    return {
        "message_hash": to_hex(msg_hash),
        "leaf_count": leaf_count,
        "leaf_index": leaf_index,
        "account_root": to_hex(account_root),
        "leaf_root": to_hex(leaf_root),
        "merkle_proof": [to_hex(value) for value in proof],
        "public_key_hashes": [to_hex(value) for value in public_key_hashes],
        "signature": [to_hex(value) for value in signature],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Lamport account signer (Keccak-256, EVM-compatible)")
    subparsers = parser.add_subparsers(dest="command", required=True)

    gen = subparsers.add_parser("genkeys", help="Summarize a Lamport account tree derived from a seed")
    gen.add_argument("--seed", required=True, help="Seed string (hashed with keccak256)")
    gen.add_argument("--leaf-count", type=int, default=16, help="Number of Lamport leaves in the account tree")

    root = subparsers.add_parser("pubroot", help="Compute the account-level Merkle root for account creation")
    root.add_argument("--seed", required=True, help="Seed string")
    root.add_argument("--leaf-count", type=int, default=16, help="Number of Lamport leaves in the account tree")

    sig = subparsers.add_parser("sign", help="Sign a 32-byte message hash with one Lamport leaf")
    sig.add_argument("--seed", required=True, help="Seed string")
    sig.add_argument("--message", required=True, help="32-byte hash (hex, 0x-prefixed)")
    sig.add_argument("--leaf-index", type=int, required=True, help="Lamport leaf index to consume")
    sig.add_argument("--leaf-count", type=int, default=16, help="Number of Lamport leaves in the account tree")

    args = parser.parse_args()

    if args.command == "genkeys":
        _, leaf_roots, account_root = generate_account_roots(args.seed, args.leaf_count)
        print(f"Generated Lamport account from seed: {args.seed}")
        print(f"  Leaf count:  {args.leaf_count}")
        print("  Per leaf:    512 private values / 512 public key hashes")
        print(f"  Signature:   256 revealed preimages ({256 * 32} bytes)")
        print(f"  Account root:{to_hex(account_root)}")
        print(f"  First leaf:  {to_hex(leaf_roots[0])}")

    elif args.command == "pubroot":
        _, _, account_root = generate_account_roots(args.seed, args.leaf_count)
        print(to_hex(account_root))

    elif args.command == "sign":
        payload = sign_message(args.seed, args.message, args.leaf_index, args.leaf_count)
        print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
