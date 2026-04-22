import { genCrystals } from "@noble/post-quantum/_crystals.js"
import * as falconLib from "@noble/post-quantum/falcon.js"
import { bytesToHex, encodeAbiParameters, hexToBytes, keccak256 } from "viem"

type Hex = `0x${string}`

const N = 512
const Q = 12289
const ROOT_OF_UNITY = 7
const F_INV = 12265

const noblePqCrystals = genCrystals({
  N,
  Q,
  F: F_INV,
  ROOT_OF_UNITY,
  newPoly: (n: number) => new Uint16Array(n),
  isKyber: false,
  brvBits: 10,
})

const PUBLIC_KEY_HEADER_BYTE = 0x09
const PUBLIC_KEY_BODY_BYTES = 896
const PUBLIC_KEY_BYTES = 1 + PUBLIC_KEY_BODY_BYTES
const SIG_HEADER_BYTE = 0x39
const SALT_LEN = 40
const COMPACT_BITS = 16
const COMPACT_WORDS = (N * COMPACT_BITS) / 256
const ALGO17_LIMIT = 2047
const KQ = 61445

const { falcon512, falcon512padded } = falconLib

type FalconCompatModule = typeof falconLib & {
  genFalcon?: (opts: unknown) => typeof falcon512padded
  falcon512paddedOpts?: Record<string, unknown>
}

function hashToPointEVM(salt: Uint8Array, msg: Uint8Array): Uint16Array {
  const concat = new Uint8Array(salt.length + msg.length)
  concat.set(salt, 0)
  concat.set(msg, salt.length)
  const initialState = keccak256(concat, "bytes")
  const extendedState = new Uint8Array(40)
  extendedState.set(initialState, 0)
  const view = new DataView(extendedState.buffer, extendedState.byteOffset, extendedState.byteLength)

  const output = new Uint16Array(N)
  let i = 0
  let counter = BigInt(0)

  while (i < N) {
    const buffer = keccak256(extendedState, "bytes")
    for (let chunkIdx = 0; chunkIdx < 16; chunkIdx++) {
      const offset = chunkIdx * 2
      const chunk = ((buffer[offset] as number) << 8) | (buffer[offset + 1] as number)
      if (chunk < KQ) {
        output[i++] = chunk % Q
        if (i === N) break
      }
    }
    counter += BigInt(1)
    view.setBigUint64(32, counter, false)
  }

  return output
}

const falcon512paddedEth = (() => {
  const compat = falconLib as FalconCompatModule
  if (compat.genFalcon && compat.falcon512paddedOpts) {
    return compat.genFalcon({
      ...compat.falcon512paddedOpts,
      hashToPoint: hashToPointEVM,
    })
  }
  return falcon512padded
})()

function compactPoly256(coeffs: ArrayLike<number | bigint>, m: number): bigint[] {
  if (m >= 256) throw new Error("m must be < 256")
  if ((coeffs.length * m) % 256 !== 0) {
    throw new Error("Total bits must be divisible by 256")
  }

  const out = new Array<bigint>((coeffs.length * m) / 256).fill(BigInt(0))
  for (let i = 0; i < coeffs.length; i++) {
    const x = coeffs[i]
    if (x === undefined) throw new Error(`compactPoly256 undefined at ${i}`)
    const value = typeof x === "bigint" ? x : BigInt(Math.floor(x))
    const word = Math.floor((i * m) / 256)
    const shift = BigInt((i % (256 / m)) * m)
    out[word] = out[word]! | (value << shift)
  }
  return out
}

function decodePublicKey14Bit(body: Uint8Array): Uint16Array {
  if (body.length !== PUBLIC_KEY_BODY_BYTES) {
    throw new Error(`Falcon-512 pk body expected ${PUBLIC_KEY_BODY_BYTES} bytes, got ${body.length}`)
  }
  const out = new Uint16Array(N)
  let buf = 0
  let bufLen = 0
  let pos = 0

  for (let i = 0; i < body.length; i++) {
    buf = (buf << 8) | body[i]!
    bufLen += 8
    if (bufLen >= 14) {
      bufLen -= 14
      const v = (buf >>> bufLen) & 0x3fff
      if (v >= Q) throw new Error(`Falcon pk coeff ${pos} out of range`)
      out[pos++] = v
      buf &= (1 << bufLen) - 1
    }
  }
  if (pos !== N) throw new Error(`Falcon pk decode failed: ${pos}/${N}`)
  return out
}

function decompressSignature(body: Uint8Array): Int16Array {
  const out = new Int16Array(N)
  let buf = 0
  let bufLen = 0
  let pos = 0

  const readBits = (n: number): number => {
    while (bufLen < n) {
      if (pos >= body.length) throw new Error("Falcon s2 decode underrun")
      buf = (buf << 8) | body[pos++]!
      bufLen += 8
    }
    bufLen -= n
    const val = (buf >>> bufLen) & ((1 << n) - 1)
    buf &= (1 << bufLen) - 1
    return val
  }

  for (let i = 0; i < N; i++) {
    const sign = readBits(1)
    const low = readBits(7)
    let high = 0
    while (readBits(1) === 0) {
      if (++high >= 16) throw new Error("Falcon unary overflow")
    }
    const v = low | (high << 7)
    if (sign && v === 0) throw new Error("Falcon negative zero")
    if (v > ALGO17_LIMIT) throw new Error("Falcon coeff overflow")
    out[i] = sign ? -v : v
  }

  if (buf !== 0) throw new Error("Falcon non-zero accumulator")
  for (let i = pos; i < body.length; i++) {
    if (body[i] !== 0) throw new Error("Falcon non-zero trailing byte")
  }
  return out
}

export function encodePublicKeyForZKNOX(rawPublicKey: Uint8Array): Hex {
  if (rawPublicKey.length !== PUBLIC_KEY_BYTES) {
    throw new Error(`Falcon-512 public key expected ${PUBLIC_KEY_BYTES} bytes, got ${rawPublicKey.length}`)
  }
  if (rawPublicKey[0] !== PUBLIC_KEY_HEADER_BYTE) {
    throw new Error("Falcon-512 key header mismatch")
  }

  const h = decodePublicKey14Bit(rawPublicKey.subarray(1))
  noblePqCrystals.NTT.encode(h)
  const compact = compactPoly256(h, COMPACT_BITS)
  if (compact.length !== COMPACT_WORDS) {
    throw new Error(`Falcon compact words mismatch: ${compact.length}`)
  }

  return encodeAbiParameters([{ type: "uint256[]" }], [compact])
}

export function encodeSignatureForZKNOX(nobleSig: Uint8Array): Hex {
  if (nobleSig.length < 1 + SALT_LEN + 1) {
    throw new Error(`Falcon signature too short: ${nobleSig.length}`)
  }
  if (nobleSig[0] !== SIG_HEADER_BYTE) {
    throw new Error("Falcon signature header mismatch")
  }

  const salt = nobleSig.subarray(1, 1 + SALT_LEN)
  const s2Signed = decompressSignature(nobleSig.subarray(1 + SALT_LEN))
  const s2ModQ = new Uint16Array(N)
  for (let i = 0; i < N; i++) {
    const v = s2Signed[i]!
    s2ModQ[i] = v < 0 ? v + Q : v
  }
  const compact = compactPoly256(s2ModQ, COMPACT_BITS)
  if (compact.length !== COMPACT_WORDS) {
    throw new Error(`Falcon s2 compact words mismatch: ${compact.length}`)
  }

  const out = new Uint8Array(SALT_LEN + COMPACT_WORDS * 32)
  out.set(salt, 0)
  for (let i = 0; i < COMPACT_WORDS; i++) {
    const word = compact[i]!
    const offset = SALT_LEN + i * 32
    for (let j = 0; j < 32; j++) {
      out[offset + (31 - j)] = Number((word >> BigInt(8 * j)) & BigInt(0xff))
    }
  }
  return bytesToHex(out)
}

export function generateFalconEthKeypair(): {
  publicKeyHex: Hex
  secretKeyHex: Hex
  encodedPublicKey: Hex
} {
  const innerSeed = new Uint8Array(48)
  globalThis.crypto.getRandomValues(innerSeed)
  const keypair = falcon512.keygen(innerSeed)
  return {
    publicKeyHex: bytesToHex(keypair.publicKey),
    secretKeyHex: bytesToHex(keypair.secretKey),
    encodedPublicKey: encodePublicKeyForZKNOX(keypair.publicKey),
  }
}

export function signFalconEth(secretKeyHex: Hex, messageHashHex: Hex): Hex {
  const signature = falcon512paddedEth.sign(hexToBytes(messageHashHex), hexToBytes(secretKeyHex))
  return encodeSignatureForZKNOX(signature)
}
