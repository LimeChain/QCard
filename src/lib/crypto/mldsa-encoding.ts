import { shake128, shake256 } from "@noble/hashes/sha3.js";
import { genCrystals } from "@noble/post-quantum/_crystals.js";
import { bytesToHex, encodeAbiParameters, type Hex } from "viem";

import { createKeccakPrg } from "./keccak-prg.js";

// ML-DSA-44 (NIST FIPS 204) parameters; matches ETHDILITHIUM submodule
// constants k=4, l=4 at ETHDILITHIUM/src/ZKNOX_dilithium_utils.sol:44-45.
const N = 256;
const Q = 8380417;
const K = 4;
const L = 4;
const D = 13; // FIPS 204 Table 1: dropped low bits in Power2Round
const RHO_BYTES = 32;
const T1_POLY_BYTES = 320; // 256 coeffs * 10 bits = 2560 bits
const TR_BYTES = 64;
const PUBLIC_KEY_BYTES = RHO_BYTES + K * T1_POLY_BYTES; // 1312
const COMPACT_BITS = 32;

// Reuse noble's NTT machinery (FIPS 204 §7.5 BitRev_8 zetas, ROOT_OF_UNITY=1753,
// F=256^-1 mod q). ZKNOX stores t1 in the NTT domain after a 2^d shift —
// see noble's verify at ml-dsa.js:560 `MultiplyNTTs(NTT.encode(polyShiftl(t1[i])), c)`,
// which the on-chain verifier expects to be PRE-COMPUTED in the pubkey.
const F_INV = 8347681; // 256^-1 mod q
const noblePqCrystals = genCrystals({
  N,
  Q,
  F: F_INV,
  ROOT_OF_UNITY: 1753,
  newPoly: (n: number) => new Int32Array(n),
  isKyber: false,
  brvBits: 8,
});

/**
 * Stateful XOF reader produced by an {@link XofFactory}. Each `xof(length)`
 * call returns the next `length` bytes of the seeded stream; callers invoke
 * it repeatedly against a single reader (e.g. the ExpandA rejection-sampling
 * loop pulls 192 B chunks until 256 valid coefficients accumulate).
 *
 * `id` is the named discriminant (M-3; AC-3-4): shared helpers such as
 * `assertBytesEqual` interpolate `(factory=<id>)` into divergence messages
 * so interleaved-factory regressions have a grep-friendly anchor.
 */
export interface XofReader {
  readonly id: "shake128" | "shake256" | "keccak-prg";
  xof(length: number): Uint8Array;
}

/**
 * Constructs a fresh {@link XofReader} over `seed`. Every call MUST return
 * an independent reader — no cached state crosses invocations (DD-10 LOCKED;
 * AC-A-1 HIGH). This property is the parameterize-by-factory contract that
 * replaces the module-level `shake{128,256}.create()` usage present
 * pre-refactor.
 */
export type XofFactory = (seed: Uint8Array) => XofReader;

/** NIST ExpandA-role adapter: noble `shake128.create().update(seed)`. */
export const shake128XofFactory: XofFactory = (seed) => {
  const h = shake128.create().update(seed);
  return {
    id: "shake128",
    xof(length: number): Uint8Array {
      const buf = new Uint8Array(length);
      h.xofInto(buf);
      return buf;
    },
  };
};

/** NIST H/tr-role adapter: noble `shake256.create().update(seed)`. */
export const shake256XofFactory: XofFactory = (seed) => {
  const h = shake256.create().update(seed);
  return {
    id: "shake256",
    xof(length: number): Uint8Array {
      const buf = new Uint8Array(length);
      h.xofInto(buf);
      return buf;
    },
  };
};

/**
 * ETH single-XOF adapter: wraps Story 2's {@link createKeccakPrg}. DD-1
 * collapses all SHAKE widths to the Keccak-PRG primitive, so both
 * `xofFactory` and `xofFactory2` parameters of
 * {@link preparePublicKeyForDeployment} are populated with this adapter
 * on the ETH path.
 */
export const keccakXofFactory: XofFactory = (seed) => {
  const p = createKeccakPrg(seed);
  p.flip();
  return {
    id: "keccak-prg",
    xof(length: number): Uint8Array {
      return p.extract(length);
    },
  };
};

export interface DecodedPublicKey {
  rho: Uint8Array;
  t1: number[][];
  tr: Uint8Array;
}

function rejectionSamplePoly(reader: XofReader): number[] {
  const r = new Array<number>(N).fill(0);
  let idx = 0;

  while (idx < N) {
    const buf = reader.xof(3 * 64);

    for (let k = 0; idx < N && k <= buf.length - 3; k += 3) {
      const b0 = buf[k];
      const b1 = buf[k + 1];
      const b2 = buf[k + 2];
      if (b0 === undefined || b1 === undefined || b2 === undefined) break;
      let t = b0 | (b1 << 8) | (b2 << 16);
      t &= 0x7fffff;
      if (t < Q) r[idx++] = t;
    }
  }

  return r;
}

export function recoverAhat(
  rho: Uint8Array,
  k: number,
  l: number,
  xofFactoryExpandA: XofFactory,
): number[][][] {
  const aHat: number[][][] = [];
  for (let i = 0; i < k; i++) {
    const row: number[][] = [];
    for (let j = 0; j < l; j++) {
      const seed = new Uint8Array(rho.length + 2);
      seed.set(rho, 0);
      seed[rho.length] = j;
      seed[rho.length + 1] = i;
      row.push(rejectionSamplePoly(xofFactoryExpandA(seed)));
    }
    aHat.push(row);
  }
  return aHat;
}

function polyDecode10Bits(bytes: Uint8Array): number[] {
  const poly = new Array<number>(N).fill(0);
  let r = BigInt(0);
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === undefined) break;
    r |= BigInt(b) << BigInt(8 * i);
  }
  const mask = (BigInt(1) << BigInt(10)) - BigInt(1);
  for (let i = 0; i < N; i++) {
    poly[i] = Number((r >> BigInt(i * 10)) & mask);
  }
  return poly;
}

export function decodePublicKey(
  publicKey: Uint8Array,
  xofFactoryH: XofFactory,
): DecodedPublicKey {
  if (publicKey.length !== PUBLIC_KEY_BYTES) {
    throw new Error(
      `Invalid ML-DSA-44 publicKey length: expected ${PUBLIC_KEY_BYTES}, got ${publicKey.length}`,
    );
  }

  const rho = publicKey.slice(0, RHO_BYTES);

  const t1: number[][] = [];
  for (let i = 0; i < K; i++) {
    const offset = RHO_BYTES + i * T1_POLY_BYTES;
    t1.push(polyDecode10Bits(publicKey.slice(offset, offset + T1_POLY_BYTES)));
  }

  const tr = xofFactoryH(new Uint8Array(publicKey)).xof(TR_BYTES);
  return { rho, t1, tr };
}

export function compactPoly256(coeffs: ArrayLike<number | bigint>, m: number): bigint[] {
  if (m >= 256) throw new Error("m must be less than 256");
  if ((coeffs.length * m) % 256 !== 0) {
    throw new Error("Total bits must be divisible by 256");
  }

  const a: bigint[] = new Array(coeffs.length);
  for (let i = 0; i < coeffs.length; i++) {
    const x = coeffs[i];
    if (x === undefined) throw new Error(`compactPoly256: undefined at ${i}`);
    const v = typeof x === "bigint" ? x : BigInt(Math.floor(x));
    if (v >= (BigInt(1) << BigInt(m))) {
      throw new Error(`Element ${v} too large for ${m} bits`);
    }
    a[i] = v;
  }

  const n = (a.length * m) / 256;
  const b = new Array<bigint>(n).fill(BigInt(0));

  for (let i = 0; i < a.length; i++) {
    const idx = Math.floor((i * m) / 256);
    const shift = BigInt((i % (256 / m)) * m);
    const cur = b[idx];
    const ai = a[i];
    if (cur === undefined || ai === undefined) {
      throw new Error(`compactPoly256: undefined at index ${i}`);
    }
    b[idx] = cur | (ai << shift);
  }

  return b;
}

export function compactModule256(
  data: ArrayLike<ArrayLike<number | bigint>>[],
  m: number,
): bigint[][][] {
  const res: bigint[][][] = [];
  for (const row of data) {
    const inner: bigint[][] = [];
    for (let j = 0; j < row.length; j++) {
      const poly = row[j];
      if (poly === undefined) throw new Error(`compactModule256: undefined row at ${j}`);
      inner.push(compactPoly256(poly, m));
    }
    res.push(inner);
  }
  return res;
}

/**
 * Apply the FIPS 204 verifier transform to one t1 polynomial: shift each
 * coefficient by 2^d (Power2Round high-bit lift) then forward NTT, leaving
 * coefficients mod q. ZKNOX_dilithium_core.sol#dilithiumCore2 uses these
 * pre-computed values directly when fusing `A*z - c*t1` (line 199), and
 * the on-chain test vectors at ETHDILITHIUM/test/dilithium.t.sol:543+
 * confirm storage in this transformed form (values up to ~2^23 ≫ 2^10).
 */
function transformT1Poly(poly: number[]): number[] {
  const buf = new Int32Array(N);
  for (let i = 0; i < N; i++) {
    const v = poly[i];
    if (v === undefined) throw new Error(`transformT1Poly: undefined at ${i}`);
    buf[i] = v << D;
  }
  noblePqCrystals.NTT.encode(buf);
  const out = new Array<number>(N);
  for (let i = 0; i < N; i++) {
    const v = buf[i]! % Q;
    out[i] = v >= 0 ? v : v + Q;
  }
  return out;
}

/**
 * Transform noble's raw 1,312-byte ML-DSA-44 NIST public key into the
 * ABI-encoded `(bytes aHatEncoded, bytes tr, bytes t1Encoded)` payload
 * that `ZKNOX_dilithium.setKey()` writes via SSTORE2 and `_readPubKey`
 * decodes (ETHDILITHIUM/src/ZKNOX_dilithium.sol:91-97). Port of
 * `ETHDILITHIUM/js/pkDeploy.js#preparePublicKeyForDeployment`, viem-flavored.
 *
 * Two-factory signature per `docs/amendments.md` §A-002 — matches the
 * Python reference `_keygen_internal(_xof=shake256, _xof2=shake128)` split:
 *
 * - `xofFactory`  ≡ Python `_xof`  — drives the `tr` H-of-pk computation
 *   (SHAKE-256 on the NIST path; Keccak-PRG on the ETH path).
 * - `xofFactory2` ≡ Python `_xof2` — drives ExpandA / `rejectionSamplePoly`
 *   (SHAKE-128 on the NIST path; Keccak-PRG on the ETH path).
 *
 * NIST callers pass `(shake256XofFactory, shake128XofFactory)`. ETH callers
 * pass `(keccakXofFactory, keccakXofFactory)` — same factory twice per DD-1.
 */
export function preparePublicKeyForDeployment(
  rawPublicKey: Uint8Array,
  xofFactory: XofFactory,
  xofFactory2: XofFactory,
): Hex {
  const { rho, t1, tr } = decodePublicKey(rawPublicKey, xofFactory);
  const aHat = recoverAhat(rho, K, L, xofFactory2);
  const t1Transformed = t1.map(transformT1Poly);

  const aHatCompact = compactModule256(aHat, COMPACT_BITS);
  const t1Transposed = [t1Transformed];
  const t1Compact = compactModule256(t1Transposed, COMPACT_BITS)[0];
  if (t1Compact === undefined) {
    throw new Error("preparePublicKeyForDeployment: t1Compact undefined");
  }

  const aHatEncoded = encodeAbiParameters(
    [{ type: "uint256[][][]" }],
    [aHatCompact],
  );
  const t1Encoded = encodeAbiParameters(
    [{ type: "uint256[][]" }],
    [t1Compact],
  );

  return encodeAbiParameters(
    [{ type: "bytes" }, { type: "bytes" }, { type: "bytes" }],
    [aHatEncoded, bytesToHex(tr), t1Encoded],
  );
}
