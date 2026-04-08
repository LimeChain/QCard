/**
 * Lamport one-time signature scheme — browser-side key management and signing.
 *
 * Key derivation chain (must match lamport_signer.py and the Solidity verifier):
 *   1. masterSeed  = keccak256(seedString.encode("utf-8"))
 *   2. leafSeed    = keccak256(masterSeed ++ leafIndex.toBytes32BE())
 *   3. privateKey[i] = keccak256(leafSeed ++ i.toBytes32BE())
 *   4. pubKeyHash[i] = keccak256(privateKey[i])
 *   5. leafRoot    = merkleRoot(pubKeyHashes)      — pairwise keccak256
 *   6. accountRoot = merkleRoot(leafRoots)
 *
 * Signing: for each bit i of msgHash (MSB-first), reveal privateKey[2*i + bit].
 */

import { keccak256 } from './keccak';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Encode `seed ++ index` the same way Solidity's
 * `abi.encodePacked(bytes32, uint256)` does: 32 bytes + 32 bytes big-endian.
 */
function abiEncodePacked(seed: Uint8Array, index: number): Uint8Array {
  const packed = new Uint8Array(64);
  packed.set(seed, 0);

  // index as 32-byte big-endian (safe for index < 2^53)
  const indexBytes = new Uint8Array(32);
  let remaining = index;
  for (let i = 31; i >= 0 && remaining > 0; i--) {
    indexBytes[i] = remaining & 0xff;
    remaining = Math.floor(remaining / 256);
  }
  packed.set(indexBytes, 32);
  return packed;
}

function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

// ---------------------------------------------------------------------------
// Key derivation
// ---------------------------------------------------------------------------

/**
 * Generate a 32-byte master seed from `crypto.getRandomValues`.
 */
export function generateMasterSeed(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

/**
 * Derive a master seed deterministically from a string.
 * Matches Python: `keccak256(seed_str.encode())`.
 */
export function deriveMasterSeedFromString(seedStr: string): Uint8Array {
  return keccak256(new TextEncoder().encode(seedStr));
}

/**
 * Derive a leaf-specific seed.
 * Matches Python: `keccak256(master_seed + leaf_index.to_bytes(32, "big"))`.
 */
export function deriveLeafSeed(
  masterSeed: Uint8Array,
  leafIndex: number,
): Uint8Array {
  return keccak256(abiEncodePacked(masterSeed, leafIndex));
}

/**
 * Generate one Lamport keypair and its leaf root for a given leaf index.
 *
 * Returns 512 private keys, 512 public-key hashes, and the Merkle root
 * of the public-key hashes.
 */
export function generateLeafKeypair(
  masterSeed: Uint8Array,
  leafIndex: number,
): {
  privateKeys: Uint8Array[];
  publicKeyHashes: Uint8Array[];
  leafRoot: Uint8Array;
} {
  const leafSeed = deriveLeafSeed(masterSeed, leafIndex);
  const privateKeys: Uint8Array[] = [];
  const publicKeyHashes: Uint8Array[] = [];

  for (let i = 0; i < 512; i++) {
    const pk = keccak256(abiEncodePacked(leafSeed, i));
    privateKeys.push(pk);
    publicKeyHashes.push(keccak256(pk));
  }

  const leafRoot = computeMerkleRoot(publicKeyHashes);
  return { privateKeys, publicKeyHashes, leafRoot };
}

// ---------------------------------------------------------------------------
// Merkle tree
// ---------------------------------------------------------------------------

/**
 * Compute a binary Merkle root via pairwise keccak256 concatenation.
 * `leaves.length` must be a positive power of two.
 */
export function computeMerkleRoot(leaves: Uint8Array[]): Uint8Array {
  if (leaves.length === 0) {
    throw new Error('at least one leaf is required');
  }
  if (!isPowerOfTwo(leaves.length)) {
    throw new Error('leaf count must be a power of two');
  }

  let layer = [...leaves];
  while (layer.length > 1) {
    const nextLayer: Uint8Array[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const concat = new Uint8Array(64);
      concat.set(layer[i], 0);
      concat.set(layer[i + 1], 32);
      nextLayer.push(keccak256(concat));
    }
    layer = nextLayer;
  }
  return layer[0];
}

/**
 * Build a Merkle inclusion proof for `leaves[leafIndex]`.
 * Returns the sibling hashes from leaf to root.
 */
export function buildMerkleProof(
  leaves: Uint8Array[],
  leafIndex: number,
): Uint8Array[] {
  if (leaves.length === 0) {
    throw new Error('at least one leaf is required');
  }
  if (!isPowerOfTwo(leaves.length)) {
    throw new Error('leaf count must be a power of two');
  }
  if (leafIndex < 0 || leafIndex >= leaves.length) {
    throw new Error(
      `leafIndex must be between 0 and ${leaves.length - 1}, got ${leafIndex}`,
    );
  }

  const proof: Uint8Array[] = [];
  let layer = [...leaves];
  let idx = leafIndex;

  while (layer.length > 1) {
    // sibling is at index XOR 1
    proof.push(layer[idx ^ 1]);

    const nextLayer: Uint8Array[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const concat = new Uint8Array(64);
      concat.set(layer[i], 0);
      concat.set(layer[i + 1], 32);
      nextLayer.push(keccak256(concat));
    }
    layer = nextLayer;
    idx >>= 1;
  }
  return proof;
}

// ---------------------------------------------------------------------------
// Account roots
// ---------------------------------------------------------------------------

/**
 * Generate all leaf roots and the account-level Merkle root.
 */
export function generateAccountRoots(
  masterSeed: Uint8Array,
  leafCount: number,
): {
  leafRoots: Uint8Array[];
  accountRoot: Uint8Array;
} {
  if (!isPowerOfTwo(leafCount)) {
    throw new Error('leafCount must be a power of two');
  }

  const leafRoots: Uint8Array[] = [];
  for (let i = 0; i < leafCount; i++) {
    const { leafRoot } = generateLeafKeypair(masterSeed, i);
    leafRoots.push(leafRoot);
  }

  const accountRoot = computeMerkleRoot(leafRoots);
  return { leafRoots, accountRoot };
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

/**
 * Produce a Lamport signature over `msgHash` using the keypair at `leafIndex`.
 *
 * For each of the 256 bits of `msgHash` (MSB-first), reveals the private key
 * at position `2*i + bit`, matching the Python signer exactly.
 */
export function signMessage(
  masterSeed: Uint8Array,
  leafIndex: number,
  leafCount: number,
  msgHash: Uint8Array,
): {
  publicKeyHashes: Uint8Array[];
  signature: Uint8Array[];
  leafIndex: number;
  merkleProof: Uint8Array[];
  accountRoot: Uint8Array;
  leafRoot: Uint8Array;
} {
  if (msgHash.length !== 32) {
    throw new Error('msgHash must be exactly 32 bytes');
  }

  const { leafRoots, accountRoot } = generateAccountRoots(
    masterSeed,
    leafCount,
  );
  const { privateKeys, publicKeyHashes, leafRoot } = generateLeafKeypair(
    masterSeed,
    leafIndex,
  );
  const merkleProof = buildMerkleProof(leafRoots, leafIndex);

  const signature: Uint8Array[] = [];
  for (let i = 0; i < 256; i++) {
    // bit i of msgHash, MSB-first: byte index = i >> 3, bit offset = 7 - (i & 7)
    const byteIdx = i >> 3;
    const bitOffset = 7 - (i & 7);
    const bit = (msgHash[byteIdx] >> bitOffset) & 1;
    signature.push(privateKeys[2 * i + bit]);
  }

  return {
    publicKeyHashes,
    signature,
    leafIndex,
    merkleProof,
    accountRoot,
    leafRoot,
  };
}
