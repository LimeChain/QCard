/**
 * Multi-scheme HCA key generation.
 *
 * Each leaf in the Merkle tree commits to a different signature scheme:
 *   - Lamport (0x01): commitment = 512 public key hashes, concatenated
 *   - Falcon  (0x02): commitment = NTT-compacted public key (uint256[32])
 *   - ECDSA   (0x03): commitment = signer address
 *
 * The leaf hash matches the contract formula:
 *   leafHash = keccak256(abi.encodePacked(version, keccak256(commitment)))
 *
 * Falcon leaves use a Python backend (ZKNox ETHFALCON pythonref via /api/falcon/keygen)
 * because js-fn-dsa and bedrock-wasm don't produce ETHFALCON-compatible byte layouts.
 * The seed sent to the backend is derived from the master seed, so the whole tree is
 * deterministic from a single master seed.
 */

import { keccak256 } from './keccak'
import { generateLeafKeypair, computeMerkleRoot, buildMerkleProof } from './lamport'
import type { LeafConfig } from '@/lib/store'

const VERSION_LAMPORT = 0x01
const VERSION_FALCON = 0x02
const VERSION_ECDSA = 0x03

export interface HCALeafData {
  index: number
  scheme: string
  version: number
  leafHash: Uint8Array
  lamportPubKeyHashes?: Uint8Array[]
  /** Falcon NTT-compacted public key, 32 uint256 hex strings (from /api/falcon/keygen) */
  falconPkCompact?: string[]
  /** 32-byte seed sent to the Falcon backend — kept so signing derives the same keypair */
  falconLeafSeedHex?: string
  ecdsaAddress?: string
}

function abiEncodeBytes32Array(arr: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(arr.length * 32)
  for (let i = 0; i < arr.length; i++) result.set(arr[i], i * 32)
  return result
}

function abiEncodeAddress(addr: string): Uint8Array {
  const clean = addr.startsWith('0x') ? addr.slice(2) : addr
  const result = new Uint8Array(32)
  const bytes = new Uint8Array(20)
  for (let i = 0; i < 20; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  result.set(bytes, 12)
  return result
}

/** abi.encode(uint256[32]) for a fixed-size 32-element array — just raw concatenation. */
function abiEncodeUint256Array32(hexValues: string[]): Uint8Array {
  if (hexValues.length !== 32) throw new Error(`expected 32 uint256 values, got ${hexValues.length}`)
  const result = new Uint8Array(32 * 32)
  for (let i = 0; i < 32; i++) {
    const clean = hexValues[i].startsWith('0x') ? hexValues[i].slice(2) : hexValues[i]
    const padded = clean.padStart(64, '0')
    for (let j = 0; j < 32; j++) {
      result[i * 32 + j] = parseInt(padded.slice(j * 2, j * 2 + 2), 16)
    }
  }
  return result
}

/** abi.encode(uint256[]) for a dynamic array: offset(32) + length(32) + data. */
function abiEncodeUint256ArrayDynamic(hexValues: string[]): Uint8Array {
  const dataLen = hexValues.length * 32
  const result = new Uint8Array(32 + 32 + dataLen)
  // offset = 32
  result[31] = 0x20
  // length
  const lenBytes = new Uint8Array(32)
  let len = hexValues.length
  for (let i = 31; i >= 0 && len > 0; i--) {
    lenBytes[i] = len & 0xff
    len = Math.floor(len / 256)
  }
  result.set(lenBytes, 32)
  // data
  for (let i = 0; i < hexValues.length; i++) {
    const clean = hexValues[i].startsWith('0x') ? hexValues[i].slice(2) : hexValues[i]
    const padded = clean.padStart(64, '0')
    for (let j = 0; j < 32; j++) {
      result[64 + i * 32 + j] = parseInt(padded.slice(j * 2, j * 2 + 2), 16)
    }
  }
  return result
}

/** Match Solidity: keccak256(abi.encodePacked(masterSeed, leafIndex as uint256)) */
function deriveFalconLeafSeed(masterSeed: Uint8Array, leafIndex: number): Uint8Array {
  const buf = new Uint8Array(64)
  buf.set(masterSeed, 0)
  // uint256 big-endian
  let remaining = leafIndex
  for (let i = 63; i >= 32 && remaining > 0; i--) {
    buf[i] = remaining & 0xff
    remaining = Math.floor(remaining / 256)
  }
  return keccak256(buf)
}

function computeLeafHash(version: number, commitment: Uint8Array): Uint8Array {
  const commitmentHash = keccak256(commitment)
  const packed = new Uint8Array(33)
  packed[0] = version
  packed.set(commitmentHash, 1)
  return keccak256(packed)
}

function toHex(bytes: Uint8Array): string {
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function falconKeygen(seedHex: string): Promise<string[]> {
  const response = await fetch('/api/falcon/keygen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seed: seedHex }),
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'unknown error' }))
    throw new Error(`Falcon keygen failed: ${err.error ?? response.statusText}`)
  }
  const data = await response.json() as { pkCompact: string[] }
  if (!Array.isArray(data.pkCompact) || data.pkCompact.length !== 32) {
    throw new Error('invalid pkCompact response from backend')
  }
  return data.pkCompact
}

/** Build the Falcon leaf commitment bytes from the NTT-compacted pubkey. */
export function buildFalconCommitment(pkCompact: string[]): Uint8Array {
  return abiEncodeUint256ArrayDynamic(pkCompact)
}

export interface KeygenProgress {
  current: number
  total: number
  scheme: string
  leafIndex: number
}

/**
 * Generate all leaf data for an HCA account tree.
 * Async because Falcon leaves call the Python backend.
 * The optional onProgress callback fires before each leaf starts.
 */
export async function generateHCALeaves(
  masterSeed: Uint8Array,
  leaves: LeafConfig[],
  ecdsaAddress?: string,
  onProgress?: (p: KeygenProgress) => void,
): Promise<HCALeafData[]> {
  const results: HCALeafData[] = []
  const total = leaves.length

  for (let idx = 0; idx < leaves.length; idx++) {
    const leaf = leaves[idx]
    onProgress?.({ current: idx + 1, total, scheme: leaf.scheme, leafIndex: leaf.index })
    if (leaf.scheme === 'Lamport') {
      const { publicKeyHashes } = generateLeafKeypair(masterSeed, leaf.index)
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
      const leafSeed = deriveFalconLeafSeed(masterSeed, leaf.index)
      const seedHex = toHex(leafSeed)
      const pkCompact = await falconKeygen(seedHex)

      const commitment = buildFalconCommitment(pkCompact)
      const leafHash = computeLeafHash(VERSION_FALCON, commitment)

      results.push({
        index: leaf.index,
        scheme: 'Falcon',
        version: VERSION_FALCON,
        leafHash,
        falconPkCompact: pkCompact,
        falconLeafSeedHex: seedHex,
      })
    } else if (leaf.scheme === 'ECDSA') {
      const addr = ecdsaAddress ?? '0x0000000000000000000000000000000000000000'
      const commitment = abiEncodeAddress(addr)
      const leafHash = computeLeafHash(VERSION_ECDSA, commitment)
      results.push({
        index: leaf.index,
        scheme: 'ECDSA',
        version: VERSION_ECDSA,
        leafHash,
        ecdsaAddress: addr,
      })
    }
  }

  return results
}

export function buildHCAAccountRoot(leafData: HCALeafData[]): {
  leafHashes: Uint8Array[]
  accountRoot: Uint8Array
} {
  const leafHashes = leafData.map(l => l.leafHash)
  const accountRoot = computeMerkleRoot(leafHashes)
  return { leafHashes, accountRoot }
}

export function buildHCAMerkleProof(leafHashes: Uint8Array[], leafIndex: number): Uint8Array[] {
  return buildMerkleProof(leafHashes, leafIndex)
}
