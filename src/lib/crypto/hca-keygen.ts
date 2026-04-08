/**
 * Multi-scheme HCA key generation.
 * Generates a Merkle tree where each leaf can be a different scheme (Lamport, Falcon, ECDSA).
 * The leaf hash matches the contract: keccak256(abi.encodePacked(version, keccak256(commitment)))
 */

import { keccak256 } from './keccak'
import { generateLeafKeypair, computeMerkleRoot, buildMerkleProof } from './lamport'
import { generateFalconKeypair } from './falcon'
import type { LeafConfig } from '@/lib/store'

// Version bytes matching the contract
const VERSION_LAMPORT = 0x01
const VERSION_FALCON = 0x02
const VERSION_ECDSA = 0x03

export interface HCALeafData {
  index: number
  scheme: string
  version: number
  leafHash: Uint8Array
  // Lamport-specific
  lamportPubKeyHashes?: Uint8Array[]
  // Falcon-specific
  falconPublicKey?: Uint8Array
  falconSecretKey?: Uint8Array
  // ECDSA-specific
  ecdsaAddress?: string
}

/**
 * ABI-encode a single bytes32[512] array as Solidity would.
 * This is a simplified version — just concatenate all 32-byte values.
 * The actual abi.encode wraps in offset+length, but for keccak256(commitment)
 * we need the full ABI encoding.
 */
function abiEncodeBytes32Array(arr: Uint8Array[]): Uint8Array {
  // abi.encode(bytes32[512]) for a fixed-size array = just concatenate all elements
  // (no offset/length prefix for fixed-size arrays in abi.encode)
  const result = new Uint8Array(arr.length * 32)
  for (let i = 0; i < arr.length; i++) {
    result.set(arr[i], i * 32)
  }
  return result
}

function abiEncodeAddress(addr: string): Uint8Array {
  // abi.encode(address) = 32 bytes, left-padded
  const clean = addr.startsWith('0x') ? addr.slice(2) : addr
  const result = new Uint8Array(32)
  const bytes = new Uint8Array(20)
  for (let i = 0; i < 20; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  result.set(bytes, 12) // left-padded to 32 bytes
  return result
}

function abiEncodeBytes(data: Uint8Array): Uint8Array {
  // abi.encode(bytes) = offset(32) + length(32) + data(padded to 32)
  const paddedLen = Math.ceil(data.length / 32) * 32
  const result = new Uint8Array(32 + 32 + paddedLen)
  // offset = 32
  result[31] = 0x20
  // length
  const lenBytes = new Uint8Array(32)
  let len = data.length
  for (let i = 31; i >= 0 && len > 0; i--) {
    lenBytes[i] = len & 0xff
    len = Math.floor(len / 256)
  }
  result.set(lenBytes, 32)
  // data
  result.set(data, 64)
  return result
}

/**
 * Compute leaf hash: keccak256(abi.encodePacked(version, keccak256(commitment)))
 * abi.encodePacked(uint8, bytes32) = 1 byte + 32 bytes = 33 bytes
 */
function computeLeafHash(version: number, commitment: Uint8Array): Uint8Array {
  const commitmentHash = keccak256(commitment)
  const packed = new Uint8Array(33)
  packed[0] = version
  packed.set(commitmentHash, 1)
  return keccak256(packed)
}

/**
 * Generate all leaf data for an HCA account tree.
 * Returns leaf hashes for the Merkle tree and per-leaf key material.
 */
export function generateHCALeaves(
  masterSeed: Uint8Array,
  leaves: LeafConfig[],
  ecdsaAddress?: string,
): HCALeafData[] {
  const results: HCALeafData[] = []

  for (const leaf of leaves) {
    if (leaf.scheme === 'Lamport') {
      const { publicKeyHashes, leafRoot } = generateLeafKeypair(masterSeed, leaf.index)
      // commitment = abi.encode(bytes32[512]) = just the concatenated hashes (fixed-size array)
      const commitment = abiEncodeBytes32Array(publicKeyHashes)
      const leafHash = computeLeafHash(VERSION_LAMPORT, commitment)

      results.push({
        index: leaf.index,
        scheme: 'Lamport',
        version: VERSION_LAMPORT,
        leafHash,
        lamportPubKeyHashes: publicKeyHashes,
      })

    } else if (leaf.scheme === 'Falcon') {
      const { publicKey, secretKey } = generateFalconKeypair()
      // commitment = abi.encode(bytes pubkey) — dynamic bytes
      const commitment = abiEncodeBytes(publicKey)
      const leafHash = computeLeafHash(VERSION_FALCON, commitment)

      results.push({
        index: leaf.index,
        scheme: 'Falcon',
        version: VERSION_FALCON,
        leafHash,
        falconPublicKey: publicKey,
        falconSecretKey: secretKey,
      })

    } else if (leaf.scheme === 'ECDSA') {
      if (!ecdsaAddress) {
        throw new Error('ECDSA leaves require a connected wallet address')
      }
      // commitment = abi.encode(address) = 32 bytes left-padded
      const commitment = abiEncodeAddress(ecdsaAddress)
      const leafHash = computeLeafHash(VERSION_ECDSA, commitment)

      results.push({
        index: leaf.index,
        scheme: 'ECDSA',
        version: VERSION_ECDSA,
        leafHash,
        ecdsaAddress,
      })
    }
  }

  return results
}

/**
 * Build the account Merkle root from HCA leaf data.
 */
export function buildHCAAccountRoot(leafData: HCALeafData[]): {
  leafHashes: Uint8Array[]
  accountRoot: Uint8Array
} {
  const leafHashes = leafData.map(l => l.leafHash)
  const accountRoot = computeMerkleRoot(leafHashes)
  return { leafHashes, accountRoot }
}

/**
 * Build a Merkle proof for a specific leaf.
 */
export function buildHCAMerkleProof(leafHashes: Uint8Array[], leafIndex: number): Uint8Array[] {
  return buildMerkleProof(leafHashes, leafIndex)
}
