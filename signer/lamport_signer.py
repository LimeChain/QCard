"""
Lamport Signature Signer — Off-chain key generation + signing for the PQC PoC.

Usage:
    python signer/lamport_signer.py genkeys --seed "my-secret-seed"
    python signer/lamport_signer.py sign --seed "my-secret-seed" --message "0xabcdef..."
    python signer/lamport_signer.py pubroot --seed "my-secret-seed"

Requirements:
    pip install pycryptodome
"""

import json
import argparse

try:
    from Crypto.Hash import keccak as _keccak_mod

    def keccak256(data: bytes) -> bytes:
        """Keccak-256 (EVM-compatible, NOT SHA-3)."""
        h = _keccak_mod.new(digest_bits=256)
        h.update(data)
        return h.digest()

except ImportError:
    try:
        import sha3

        def keccak256(data: bytes) -> bytes:
            return sha3.keccak_256(data).digest()

    except ImportError:
        raise ImportError(
            "Install pycryptodome or pysha3 for Keccak-256:\n"
            "  pip install pycryptodome\n"
            "  # or: pip install pysha3"
        )


def derive_private_key(seed_bytes: bytes, index: int) -> bytes:
    """Derive a private key value matching Solidity: keccak256(abi.encodePacked(seed, uint256(index))).

    abi.encodePacked(bytes32, uint256) = 32 bytes + 32 bytes = 64 bytes concatenated.
    """
    packed = seed_bytes + index.to_bytes(32, "big")
    return keccak256(packed)


def generate_keypair(seed_str: str):
    """Generate a full Lamport keypair (512 private values, 512 public hashes).

    Matches the Solidity test helper:
        for (uint256 i = 0; i < 512; i++) {
            privateKeys[i] = keccak256(abi.encodePacked(seed, i));
            pubKeyHashes[i] = keccak256(abi.encodePacked(privateKeys[i]));
        }
    """
    seed_bytes = keccak256(seed_str.encode())  # Matches keccak256("seed-string") in Solidity

    private_keys = []
    public_key_hashes = []

    for i in range(512):
        priv = derive_private_key(seed_bytes, i)
        pub = keccak256(priv)  # abi.encodePacked(bytes32) = just the bytes32 itself
        private_keys.append(priv)
        public_key_hashes.append(pub)

    return private_keys, public_key_hashes


def compute_merkle_root(hashes: list[bytes]) -> bytes:
    """Compute Merkle root of 512 leaves. Matches LamportVerifier._computeMerkleRoot."""
    layer = list(hashes)
    n = len(layer)
    while n > 1:
        next_layer = []
        for i in range(0, n, 2):
            # abi.encodePacked(bytes32, bytes32) = 64 bytes concatenated
            combined = layer[i] + layer[i + 1]
            next_layer.append(keccak256(combined))
        layer = next_layer
        n = len(layer)
    return layer[0]


def sign_message(seed_str: str, msg_hash_hex: str):
    """Sign a 32-byte message hash with a Lamport key."""
    private_keys, public_key_hashes = generate_keypair(seed_str)

    msg_hash = bytes.fromhex(msg_hash_hex.replace("0x", ""))
    assert len(msg_hash) == 32, f"Message hash must be 32 bytes, got {len(msg_hash)}"

    msg_int = int.from_bytes(msg_hash, "big")

    signature = []
    for i in range(256):
        bit = (msg_int >> (255 - i)) & 1
        # private_keys[2*i] = left, private_keys[2*i+1] = right
        signature.append(private_keys[2 * i + bit])

    return signature, public_key_hashes


def to_hex(b: bytes) -> str:
    return "0x" + b.hex()


def main():
    parser = argparse.ArgumentParser(description="Lamport Signature Signer (Keccak-256, EVM-compatible)")
    subparsers = parser.add_subparsers(dest="command")

    gen = subparsers.add_parser("genkeys", help="Generate and display a keypair")
    gen.add_argument("--seed", required=True, help="Seed string (hashed with keccak256)")

    root = subparsers.add_parser("pubroot", help="Compute Merkle root of public key hashes")
    root.add_argument("--seed", required=True, help="Seed string")

    sig = subparsers.add_parser("sign", help="Sign a 32-byte message hash")
    sig.add_argument("--seed", required=True, help="Seed string")
    sig.add_argument("--message", required=True, help="32-byte hash (hex, 0x-prefixed)")

    args = parser.parse_args()

    if args.command == "genkeys":
        private_keys, public_key_hashes = generate_keypair(args.seed)
        root = compute_merkle_root(public_key_hashes)
        print(f"Generated Lamport keypair from seed: {args.seed}")
        print(f"  Private key: {len(private_keys)} values ({len(private_keys) * 32} bytes)")
        print(f"  Public key:  {len(public_key_hashes)} hashes ({len(public_key_hashes) * 32} bytes)")
        print(f"  Merkle root: {to_hex(root)}")

    elif args.command == "pubroot":
        _, public_key_hashes = generate_keypair(args.seed)
        root = compute_merkle_root(public_key_hashes)
        print(to_hex(root))

    elif args.command == "sign":
        signature, public_key_hashes = sign_message(args.seed, args.message)
        root = compute_merkle_root(public_key_hashes)

        output = {
            "message_hash": args.message,
            "merkle_root": to_hex(root),
            "public_key_hashes": [to_hex(h) for h in public_key_hashes],
            "signature": [to_hex(s) for s in signature],
        }
        print(json.dumps(output, indent=2))

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
