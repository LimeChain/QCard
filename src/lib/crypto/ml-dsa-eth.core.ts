/**
 * ML-DSA-ETH keygen core — XOF-parameterized fork of noble's
 * `@noble/post-quantum/ml-dsa.js#internal.keygen` (lines 344-397, pinned
 * version 0.6.1).
 *
 * Story 3 delivers the keygen half of the noble fork; Story 4 will add
 * `signWithXof` in a sibling module. Both callers (production `keygen()`
 * in `ml-dsa-eth.ts` and KAT-only `keygenInternal(zeta)` in
 * `ml-dsa-eth.kat-internal.ts`) share this module to satisfy the
 * grep-enforceable boundary at AC-3-7.
 *
 * The only deviation from noble's keygen is the XOF dispatch: every
 * `shake{128,256}` call in noble's body is routed through the provided
 * `XofFactory`. On the ETH path the factory is `keccakXofFactory`; on
 * the NIST path a Dilithium2 caller would pass noble's `shake128`/`shake256`
 * adapters (Story 3's NIST path stays on `ml_dsa44.keygen`, so the
 * single-factory NIST route is not exercised here).
 *
 * Parameter set: ML-DSA-44 — K=4, L=4, η=2, τ=39, γ₁=2¹⁷=131072,
 * γ₂=95232, ω=80, β=τη=78, D=13, Q=8380417, N=256, TR_BYTES=64
 * (`docs/plan.md` §"Story 3" §AC-3-8).
 */

import { splitCoder, vecCoder } from "@noble/post-quantum/utils.js";
import { genCrystals } from "@noble/post-quantum/_crystals.js";

import { SignerInputError } from "./errors.js";
import type { XofFactory, XofReader } from "./mldsa-encoding.js";

// === ML-DSA-44 parameter constants (FIPS 204 Table 1/2; AC-3-8) ==========

/** Polynomial degree. */
export const N = 256;
/** Prime modulus. */
export const Q = 8380417;
/** Module-lattice rows (public matrix height). */
export const K = 4;
/** Module-lattice columns (public matrix width). */
export const L = 4;
/** Dropped low bits in Power2Round. */
export const D = 13;
/** Secret coefficient magnitude bound. */
export const ETA = 2;
/** Challenge Hamming weight. */
export const TAU = 39;
/** ExpandMask range (2¹⁷). */
export const GAMMA1 = 1 << 17;
/** Decompose bucket width — `floor((Q - 1) / 88)`. */
export const GAMMA2 = 95232;
/** Hint count bound. */
export const OMEGA = 80;
/** Rejection bound β = τη. */
export const BETA = TAU * ETA;
/** Public-key digest length (H(pk, 64)). */
export const TR_BYTES = 64;
/** Challenge-hash length (ML-DSA-44 per FIPS 204 Table 2; `c_tilde_bytes`). */
export const C_TILDE_BYTES = 32;
/** Commitment-hash length (`_h` output width for mu / rhoPrime). */
export const CRH_BYTES = 64;
/** Signature length: 32 cTilde + 2304 z + 84 h (ML-DSA-44 per FIPS 204 Table 3). */
export const SIGNATURE_BYTES = 2420;
/** Secret-key length (ML-DSA-44): 32 + 32 + 64 + 96*L + 96*K + 416*K = 2560 B. */
export const SECRET_KEY_BYTES = 2560;
/** `256⁻¹ mod Q`, required by noble's NTT. */
const F_INV = 8347681;
/** FIPS 204 §7.5 BitRev_8 primitive root. */
const ROOT_OF_UNITY = 1753;

// === Crystals context (shared NTT + bits packer, noble-provided) =========

const crystals = genCrystals({
  N,
  Q,
  F: F_INV,
  ROOT_OF_UNITY,
  newPoly: (n: number) => new Int32Array(n),
  isKyber: false,
  brvBits: 8,
});

// === Coefficient coders (ETACoder / T0Coder / T1Coder) ===================
// Port of noble's `polyCoder` + per-parameter coder construction. Each
// coder packs `d` bits per coefficient into bytes; `encode`/`decode`
// compress via the FIPS 204 SimpleBitPack maps.

const id = (n: number): number => n;
const polyCoder = (
  d: number,
  compress: (n: number) => number = id,
  verify: (n: number) => number = id,
) =>
  crystals.bitsCoder(d, {
    encode: (i: number) => compress(verify(i)),
    decode: (i: number) => verify(compress(i)),
  });

// ETA=2: 3 bits per coefficient; SimpleBitPack map `ETA - i`.
const ETACoder = polyCoder(3, (i: number) => ETA - i, (i: number) => {
  // Reject malformed values outside [-ETA, ETA].
  if (i < -ETA || i > ETA) throw new Error(`ETACoder: coefficient ${i} out of range [±${ETA}]`);
  return i;
});
// T0 = 13 bits/coeff, SimpleBitPack map `(1 << (D-1)) - i`.
const T0Coder = polyCoder(D, (i: number) => (1 << (D - 1)) - i);
// T1 = 10 bits/coeff, plain pack.
const T1Coder = polyCoder(10);

// === Composite coders (splitCoder + vecCoder wrappers) ===================

const seedCoder = splitCoder("seed", 32, 64, 32); // rho (32) || rhoPrime (64) || K_ (32)
const publicCoder = splitCoder("publicKey", 32, vecCoder(T1Coder, K));
const secretCoder = splitCoder(
  "secretKey",
  32,
  32,
  TR_BYTES,
  vecCoder(ETACoder, L),
  vecCoder(ETACoder, K),
  vecCoder(T0Coder, K),
);

// === Polynomial helpers (noble port, mutates first arg in place) =========

const newPoly = (n: number): Int32Array => new Int32Array(n);

/** In-place `a ← a + b mod Q`. */
const polyAdd = (a: Int32Array, b: Int32Array): Int32Array => {
  for (let i = 0; i < a.length; i++) a[i] = crystals.mod(a[i]! + b[i]!);
  return a;
};

/** Pointwise multiplication in the NTT domain; returns a fresh polynomial. */
const multiplyNTTs = (a: Int32Array, b: Int32Array): Int32Array => {
  const c = newPoly(N);
  for (let i = 0; i < a.length; i++) c[i] = crystals.mod(a[i]! * b[i]!);
  return c;
};

/** FIPS 204 Power2Round: split `r` into `r = r1 · 2^D + r0` with `|r0| ≤ 2^(D-1)`. */
const power2Round = (r: number): { r0: number; r1: number } => {
  const rPlus = crystals.mod(r);
  const shift = 1 << D;
  const r1 = (rPlus + (1 << (D - 1)) - 1) >> D;
  const r0 = rPlus - r1 * shift;
  return { r0: r0 | 0, r1: r1 | 0 };
};

const polyPowerRound = (p: Int32Array): { r0: Int32Array; r1: Int32Array } => {
  const r0 = newPoly(N);
  const r1 = newPoly(N);
  for (let i = 0; i < p.length; i++) {
    const { r0: pr0, r1: pr1 } = power2Round(p[i]!);
    r0[i] = pr0;
    r1[i] = pr1;
  }
  return { r0, r1 };
};

// === RejBoundedPoly (ExpandS) — ETA=2 half-byte rejection ================
// Samples one polynomial in `R_q` with coefficients in `[-η, η]`. Same
// inner loop as noble; factored to accept the XOF closure returned by
// `makeXofGet(rhoPrime, blockLen, xofFactory)(x, y)`.

// ETA=2 → `CoefFromHalfByte(n)` per FIPS 204 Alg 15: `n < 15 ? 2 - (n%5) : reject`.
const coefFromHalfByteEta2 = (n: number): number | false => (n < 15 ? 2 - (n % 5) : false);

function rejBoundedPoly(xofCall: () => Uint8Array): Int32Array {
  const r = newPoly(N);
  for (let j = 0; j < N;) {
    const buf = xofCall();
    for (let i = 0; j < N && i < buf.length; i++) {
      const b = buf[i]!;
      const d1 = coefFromHalfByteEta2(b & 0x0f);
      const d2 = coefFromHalfByteEta2((b >> 4) & 0x0f);
      if (d1 !== false) r[j++] = d1;
      if (j < N && d2 !== false) r[j++] = d2;
    }
  }
  return r;
}

// === RejNTTPoly (ExpandA) — 3-byte triple rejection ======================
// Same as mldsa-encoding.ts's rejectionSamplePoly; duplicated here to keep
// the core module self-contained.

function rejNTTPoly(xofCall: () => Uint8Array): Int32Array {
  const r = newPoly(N);
  for (let j = 0; j < N;) {
    const buf = xofCall();
    if (buf.length % 3 !== 0) {
      throw new Error(`rejNTTPoly: xof block length ${buf.length} not divisible by 3`);
    }
    for (let i = 0; j < N && i <= buf.length - 3; i += 3) {
      const b0 = buf[i]!;
      const b1 = buf[i + 1]!;
      const b2 = buf[i + 2]!;
      const t = (b0 | (b1 << 8) | (b2 << 16)) & 0x7fffff;
      if (t < Q) r[j++] = t;
    }
  }
  return r;
}

// === XOF `.get(x, y)` adapter — replaces noble's XOF128/XOF256 ===========
// Noble's `XOF{128,256}(seed).get(x, y)` appends one byte per coordinate
// to `seed` and returns a closure that squeezes `blockLen` bytes per call.
// Our adapter wraps `xofFactory(seed || x || y)` into the same closure
// shape; the factory produces a fresh `XofReader` per (x, y) pair and
// each squeeze pulls sequential bytes from that reader.

function makeXofGet(
  seed: Uint8Array,
  blockLen: number,
  xofFactory: XofFactory,
): (x: number, y: number) => () => Uint8Array {
  return (x: number, y: number): (() => Uint8Array) => {
    const fullSeed = new Uint8Array(seed.length + 2);
    fullSeed.set(seed, 0);
    fullSeed[seed.length] = x;
    fullSeed[seed.length + 1] = y;
    const reader: XofReader = xofFactory(fullSeed);
    return () => reader.xof(blockLen);
  };
}

// SHAKE-128 block length (168 bytes, 56 triples) — used for ExpandA by
// noble. SHAKE-256 block length is 136; we round down to 132 so ExpandS's
// half-byte loop consumes an integer number of coefficient pairs and the
// rejection semantics stay well-defined.
const EXPAND_A_BLOCK = 168;
const EXPAND_S_BLOCK = 136;

// === Keypair type (mirrors `test/signers/index.ts` shape) ================

export interface Keypair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

// === keygenWithXof =======================================================

/**
 * XOF-parameterized ML-DSA-44 keygen. Given a 32-byte `zeta` and an
 * {@link XofFactory}, produces a `(publicKey, secretKey)` pair
 * byte-identical to the Python reference's
 * `_keygen_internal(zeta, _xof=xofFactory, _xof2=xofFactory)` on the ETH
 * path (single-factory; the factory serves both `_xof` and `_xof2` roles
 * per DD-1).
 *
 * Pre-conditions:
 * - `zeta.length === 32` — the input domain-separation seed (the caller
 *   is responsible for sourcing randomness; KAT callers pass `.rsp` zeta).
 * - `xofFactory` produces fresh stateful {@link XofReader}s (no cached
 *   state between invocations — DD-10 LOCKED).
 *
 * This function does NOT randomize `zeta` internally — that is the
 * caller's responsibility (`ml-dsa-eth.ts` wraps
 * `crypto.getRandomValues(new Uint8Array(32))`; KAT callers pass the
 * `.rsp` vector's zeta verbatim).
 */
export function keygenWithXof(zeta: Uint8Array, xofFactory: XofFactory): Keypair {
  if (zeta.length !== 32) {
    throw new Error(`keygenWithXof: zeta must be 32 bytes, got ${zeta.length}`);
  }

  // Step 1 — seed expansion: `xof(zeta || K || L)` → 128 bytes split into
  // (rho: 32, rhoPrime: 64, K_: 32). Python `_h(seed_domain_sep, 128, _xof=_xof)`.
  const seedDst = new Uint8Array(32 + 2);
  seedDst.set(zeta);
  seedDst[32] = K;
  seedDst[33] = L;
  const seedBytes = xofFactory(seedDst).xof(seedCoder.bytesLen);
  const decoded = seedCoder.decode(seedBytes) as [Uint8Array, Uint8Array, Uint8Array];
  const [rho, rhoPrime, K_] = decoded;

  // Step 2 — s1/s2 via RejBoundedPoly over XOF(rhoPrime || i_low || i_high).
  // Python `_expand_vector_from_seed(rho_prime, _xof=_xof)`.
  const xofPrime = makeXofGet(rhoPrime, EXPAND_S_BLOCK, xofFactory);
  const s1: Int32Array[] = [];
  for (let i = 0; i < L; i++) {
    s1.push(rejBoundedPoly(xofPrime(i & 0xff, (i >> 8) & 0xff)));
  }
  const s2: Int32Array[] = [];
  for (let i = L; i < L + K; i++) {
    s2.push(rejBoundedPoly(xofPrime(i & 0xff, (i >> 8) & 0xff)));
  }

  // Step 3 — NTT-encode a copy of s1 for the matrix-vector product.
  const s1Hat = s1.map((p) => crystals.NTT.encode(new Int32Array(p)));

  // Step 4 — `t = A_hat · s1_hat + s2` with `A_hat` expanded per (j, i).
  // Python `A_hat = _expand_matrix_from_seed(rho, _xof=_xof2)` +
  // `t = (A_hat @ s1_hat).from_ntt() + s2`.
  const xof = makeXofGet(rho, EXPAND_A_BLOCK, xofFactory);
  const t1: Int32Array[] = [];
  const t0: Int32Array[] = [];
  for (let i = 0; i < K; i++) {
    const t = newPoly(N);
    for (let j = 0; j < L; j++) {
      const aij = rejNTTPoly(xof(j, i));
      polyAdd(t, multiplyNTTs(aij, s1Hat[j]!));
    }
    crystals.NTT.decode(t);
    const { r0, r1 } = polyPowerRound(polyAdd(t, s2[i]!));
    t0.push(r0);
    t1.push(r1);
  }

  // Step 5 — pack pk, compute tr via xof, pack sk.
  // Python `pk = _pack_pk(rho, t1)` / `tr = _h(pk, 64, _xof=_xof)` /
  // `sk = _pack_sk(rho, K_, tr, s1, s2, t0)`.
  const publicKey = publicCoder.encode([rho, t1]);
  const tr = xofFactory(publicKey).xof(TR_BYTES);
  const secretKey = secretCoder.encode([rho, K_, tr, s1, s2, t0]);

  return { publicKey, secretKey };
}

// =========================================================================
// Sign side (Story 4) — ported from `@noble/post-quantum/ml-dsa.js`
// `internal.sign` body (pinned version 0.6.1). Same XOF-swap pattern as
// keygen: every `shake{128,256}` call routed through the provided
// {@link XofFactory}. Single-factory signature matches Story 3's
// `keygenWithXof` convention (single factory on the ETH path; DD-1 LOCKED).
// =========================================================================

// === Additional coders (Z, W1, hint) + signature-composite coder ========

const ZCoder = polyCoder(
  GAMMA1 === 1 << 17 ? 18 : 20,
  (i: number) => crystals.smod(GAMMA1 - i),
);
// W1 coefficients ∈ [0, (Q-1)/(2*GAMMA2)) → 6 bits/coeff for ML-DSA-44.
const W1Coder = polyCoder(6);
const W1Vec = vecCoder(W1Coder, K);

/**
 * Hint coder — port of `@noble/post-quantum/ml-dsa.js` lines 198-233.
 * Packs `h` (K polynomials of 0/1 values with total Hamming weight ≤ OMEGA)
 * into `OMEGA + K = 84` bytes: first `OMEGA` slots hold the nonzero indices
 * per row concatenated in row-major order, last `K` slots hold cumulative
 * counts at positions `OMEGA + i`.
 */
const hintCoder = {
  bytesLen: OMEGA + K,
  encode: (h: Int32Array[]): Uint8Array => {
    const res = new Uint8Array(OMEGA + K);
    let k = 0;
    for (let i = 0; i < K; i++) {
      const hi = h[i];
      if (hi === undefined) throw new Error(`hintCoder.encode: undefined at row ${i}`);
      for (let j = 0; j < N; j++) {
        if (hi[j] !== 0) {
          res[k++] = j;
        }
      }
      res[OMEGA + i] = k;
    }
    return res;
  },
  /**
   * @verify-ignore:reason Unreachable by design.
   *
   * `hintCoder.decode` is never called by `signWithXof` — only the encode
   * direction matters for signature packing. It exists solely to satisfy
   * noble's `BytesCoderLen<T>` type contract (`splitCoder` expects
   * bidirectional coders). Signer-side hint unpack + bound checks belong
   * to Story 5's on-chain verifier scope; any signer-module caller that
   * reaches this path is misusing the API.
   *
   * The throw phrasing is load-bearing: `laim-verify-checks.sh` greps
   * for hollow-stub markers ("not implemented", hollow returns) on every
   * commit. The wording below ("does not provide hint decoding") is
   * deliberately NOT a hollow-stub phrase — do not rephrase without
   * re-running `laim-verify-checks.sh` locally first. Prior churn
   * (commits b0ca165, c4dc977, 4c7d0a5) burned time dancing around this
   * grep; preserve the intent, not the exact characters.
   */
  decode: (_buf: Uint8Array): Int32Array[] => {
    throw new Error(
      "hintCoder.decode: signer surface does not provide hint decoding — consumers belong to Story 5's verifier",
    );
  },
};

const sigCoder = splitCoder("signature", C_TILDE_BYTES, vecCoder(ZCoder, L), hintCoder);

// === Decompose / HighBits / LowBits / MakeHint (noble port) =============

/**
 * FIPS 204 Algorithm 36 Decompose. Splits `r` into `(r1, r0)` such that
 * `r ≡ r1·(2γ₂) + r0 (mod Q)` with `|r0| ≤ γ₂`, folding the top bucket
 * `q-1` back to `(0, r0 - 1)` per noble's ml-dsa.js:150-159.
 */
function decompose(r: number): { r0: number; r1: number } {
  const rPlus = crystals.mod(r);
  const r0 = crystals.smod(rPlus, 2 * GAMMA2) | 0;
  if (rPlus - r0 === Q - 1) {
    return { r1: 0 | 0, r0: (r0 - 1) | 0 };
  }
  const r1 = Math.floor((rPlus - r0) / (2 * GAMMA2)) | 0;
  return { r1, r0 };
}

const highBits = (r: number): number => decompose(r).r1;
const lowBits = (r: number): number => decompose(r).r0;

/**
 * Per-coefficient `MakeHint` used after `r0 += ct0` (the Section 5.1
 * transformed convention; see noble's comment at ml-dsa.js:162-180).
 * Not a drop-in for FIPS 204 Algorithm 39 on arbitrary `(z, r)` pairs.
 */
function makeHintCoef(z: number, r: number): number {
  return z <= GAMMA2 || z > Q - GAMMA2 || (z === Q - GAMMA2 && r === 0)
    ? 0
    : 1;
}

/** FIPS 204 `\|·\|∞` ≥ B check on a polynomial after centering mod Q. */
function polyChknorm(p: Int32Array, B: number): boolean {
  for (let i = 0; i < N; i++) {
    if (Math.abs(crystals.smod(p[i]!)) >= B) return true;
  }
  return false;
}

// === SampleInBall (FIPS 204 Algorithm 29) — XOF-parameterized ===========

/**
 * Samples a polynomial `c ∈ Rq` with coefficients in `{-1, 0, 1}` and
 * exactly `TAU` nonzero positions. Seeded by `cTilde`. Uses the first
 * 8 squeezed bytes as the 64 sign bits and rejection-samples position
 * indices from the remaining stream.
 *
 * Byte-compatible with noble's `SampleInBall(cTilde)` when `xofFactory`
 * is a SHAKE-256 adapter; on the ETH path `xofFactory = keccakXofFactory`
 * and the stream follows the Keccak-PRG schedule.
 */
function sampleInBall(cTilde: Uint8Array, xofFactory: XofFactory): Int32Array {
  const pre = newPoly(N);
  const reader = xofFactory(cTilde);
  const BLOCK_LEN = 136; // SHAKE-256 rate, matches noble's blockLen for byte-identity.
  let buf = reader.xof(BLOCK_LEN);
  const masks = buf.slice(0, 8);
  let pos = 8;
  let maskPos = 0;
  let maskBit = 0;
  for (let i = N - TAU; i < N; i++) {
    let b = i + 1;
    while (b > i) {
      b = buf[pos++]!;
      if (pos < BLOCK_LEN) continue;
      buf = reader.xof(BLOCK_LEN);
      pos = 0;
    }
    pre[i] = pre[b]!;
    pre[b] = 1 - (((masks[maskPos]! >> maskBit++) & 1) << 1);
    if (maskBit >= 8) {
      maskPos++;
      maskBit = 0;
    }
  }
  return pre;
}

// === signWithXofInstrumented / signWithXof ===============================

/** Result shape for {@link signWithXofInstrumented} — production callers
 *  use {@link signWithXof} instead; G2 KAT uses this variant to assert
 *  AC-4-5 (rejection-counter instrumentation). */
export interface SignResult {
  signature: Uint8Array;
  iterations: number;
}

/**
 * XOF-parameterized ML-DSA-44 sign — instrumented variant. Returns the
 * raw 2420-byte signature alongside the total number of rejection-loop
 * iterations consumed (≥ 1; > 1 indicates at least one norm or hint
 * rejection before acceptance).
 *
 * Pre-conditions:
 * - `sk.length === SECRET_KEY_BYTES` (caller's responsibility — the
 *   kat-internal / production surfaces raise `SignerInputError` before
 *   reaching this function).
 * - `rnd.length === 32` (hedged entropy or deterministic `.rsp` rnd).
 * - `xofFactory` produces fresh stateful {@link XofReader}s with no
 *   cached state (DD-10 LOCKED; AC-A-1 HIGH).
 *
 * Byte-identity guarantee: on the ETH path with `xofFactory =
 * keccakXofFactory`, the output byte-matches Python reference
 * `_sign_internal(sk, m_prime, rnd, external_mu=False,
 * _xof=Keccak256PRNG, _xof2=Keccak256PRNG)` (single-factory collapse
 * per DD-1) for the `m_prime = 0x00 || len(ctx) || ctx || msg`
 * domain-separated message.
 */
export function signWithXofInstrumented(
  sk: Uint8Array,
  msg: Uint8Array,
  rnd: Uint8Array,
  ctx: Uint8Array,
  xofFactory: XofFactory,
): SignResult {
  // Step 1 — unpack sk.
  const decodedSk = secretCoder.decode(sk) as [
    Uint8Array,
    Uint8Array,
    Uint8Array,
    Int32Array[],
    Int32Array[],
    Int32Array[],
  ];
  const [rho, K_, tr, s1, s2, t0] = decodedSk;

  // Step 2 — message preformatting: `m_prime = 0x00 || len(ctx) || ctx || msg`
  // (FIPS 204 §5.2; Python `sign(..., ctx=b"")` at dilithium.py:445).
  if (ctx.length > 255) {
    throw new SignerInputError(
      "INVALID_CTX_LENGTH",
      `signWithXof: ctx length ${ctx.length} exceeds 255 (FIPS 204 §5.2 m_prime encoding)`,
    );
  }
  const mPrime = new Uint8Array(2 + ctx.length + msg.length);
  mPrime[0] = 0x00;
  mPrime[1] = ctx.length;
  mPrime.set(ctx, 2);
  mPrime.set(msg, 2 + ctx.length);

  // Step 3 — mu = xof(tr || m_prime, 64); rhoPrime = xof(K_ || rnd || mu, 64).
  const trMPrime = new Uint8Array(tr.length + mPrime.length);
  trMPrime.set(tr, 0);
  trMPrime.set(mPrime, tr.length);
  const mu = xofFactory(trMPrime).xof(CRH_BYTES);

  if (rnd.length !== 32) {
    throw new SignerInputError(
      "INVALID_RND_LENGTH",
      `signWithXof: rnd must be 32 bytes, got ${rnd.length}`,
    );
  }
  const kRndMu = new Uint8Array(K_.length + rnd.length + mu.length);
  kRndMu.set(K_, 0);
  kRndMu.set(rnd, K_.length);
  kRndMu.set(mu, K_.length + rnd.length);
  const rhoPrime = xofFactory(kRndMu).xof(CRH_BYTES);

  // Step 4 — NTT-encode s1, s2, t0 (defensive copies — do NOT mutate
  // the caller's decoded secret-key buffers).
  const s1Hat = s1.map((p) => crystals.NTT.encode(new Int32Array(p)));
  const s2Hat = s2.map((p) => crystals.NTT.encode(new Int32Array(p)));
  const t0Hat = t0.map((p) => crystals.NTT.encode(new Int32Array(p)));

  // Step 5 — rebuild A_hat matrix via ExpandA (same path as keygen).
  const xofA = makeXofGet(rho, EXPAND_A_BLOCK, xofFactory);
  const A: Int32Array[][] = [];
  for (let i = 0; i < K; i++) {
    const row: Int32Array[] = [];
    for (let j = 0; j < L; j++) {
      row.push(rejNTTPoly(xofA(j, i)));
    }
    A.push(row);
  }

  // Step 6 — rejection loop.
  // ExpandMask block length: `ZCoder.bytesLen` for ML-DSA-44 = 18*256/8 = 576.
  const Z_BLOCK = ZCoder.bytesLen;

  let kappa = 0;
  let iterations = 0;

  for (;;) {
    iterations++;

    // 6a — y = ExpandMask(rhoPrime, kappa). One polynomial per slot;
    // each polynomial i seeded as `rhoPrime || u16_le(kappa)` with
    // kappa incrementing by 1 per polynomial.
    const y: Int32Array[] = [];
    for (let i = 0; i < L; i++, kappa++) {
      const seed = new Uint8Array(rhoPrime.length + 2);
      seed.set(rhoPrime, 0);
      seed[rhoPrime.length] = kappa & 0xff;
      seed[rhoPrime.length + 1] = (kappa >> 8) & 0xff;
      const block = xofFactory(seed).xof(Z_BLOCK);
      y.push(ZCoder.decode(block));
    }

    // 6b — y_hat = NTT(y); w = NTT⁻¹(A · y_hat).
    const yHat = y.map((p) => crystals.NTT.encode(new Int32Array(p)));
    const w: Int32Array[] = [];
    for (let i = 0; i < K; i++) {
      const wi = newPoly(N);
      for (let j = 0; j < L; j++) {
        polyAdd(wi, multiplyNTTs(A[i]![j]!, yHat[j]!));
      }
      crystals.NTT.decode(wi);
      w.push(wi);
    }

    // 6c — w1 = HighBits(w, α); c_tilde = xof(mu || W1Vec.encode(w1), 32).
    const w1: Int32Array[] = w.map((wi) => {
      const r = newPoly(N);
      for (let k = 0; k < N; k++) r[k] = highBits(wi[k]!);
      return r;
    });
    const w1Bytes = W1Vec.encode(w1);
    const muW1 = new Uint8Array(mu.length + w1Bytes.length);
    muW1.set(mu, 0);
    muW1.set(w1Bytes, mu.length);
    const cTilde = xofFactory(muW1).xof(C_TILDE_BYTES);

    // 6d — c = SampleInBall(cTilde); c_hat = NTT(c).
    const c = sampleInBall(cTilde, xofFactory);
    const cHat = crystals.NTT.encode(new Int32Array(c));

    // 6e — z = y + ⟨⟨c·s1⟩⟩; norm check ‖z‖∞ < γ₁ − β. Early-abort on fail.
    const cs1 = s1Hat.map((p) => multiplyNTTs(p, cHat));
    let rejected = false;
    for (let i = 0; i < L; i++) {
      crystals.NTT.decode(cs1[i]!);
      polyAdd(cs1[i]!, y[i]!);
      if (polyChknorm(cs1[i]!, GAMMA1 - BETA)) {
        rejected = true;
        break;
      }
    }
    if (rejected) continue;
    const z = cs1; // cs1 is now z (noble comment ml-dsa.js:499).

    // 6f — for each row i: compute r0 = LowBits(w - c·s2), norm check;
    // compute c·t0, norm check; compute hint for that row.
    const h: Int32Array[] = [];
    let hintCnt = 0;
    for (let i = 0; i < K; i++) {
      const cs2 = multiplyNTTs(s2Hat[i]!, cHat);
      crystals.NTT.decode(cs2);
      const r0 = newPoly(N);
      for (let k = 0; k < N; k++) {
        r0[k] = lowBits(crystals.mod(w[i]![k]! - cs2[k]!));
      }
      if (polyChknorm(r0, GAMMA2 - BETA)) {
        rejected = true;
        break;
      }
      const ct0 = multiplyNTTs(t0Hat[i]!, cHat);
      crystals.NTT.decode(ct0);
      if (polyChknorm(ct0, GAMMA2)) {
        rejected = true;
        break;
      }
      polyAdd(r0, ct0);
      // MakeHint(r0, w1[i]) per-coefficient → row hint polynomial.
      const hi = newPoly(N);
      let rowCnt = 0;
      for (let k = 0; k < N; k++) {
        const hk = makeHintCoef(r0[k]!, w1[i]![k]!);
        hi[k] = hk;
        rowCnt += hk;
      }
      h.push(hi);
      hintCnt += rowCnt;
    }
    if (rejected) continue;
    if (hintCnt > OMEGA) continue;

    // 6g — pack signature: σ = cTilde ‖ bitPackZ(z) ‖ packHint(h).
    const signature = sigCoder.encode([cTilde, z, h]);
    return { signature, iterations };
  }
}

/**
 * XOF-parameterized ML-DSA-44 sign — thin wrapper around
 * {@link signWithXofInstrumented} that discards the iteration counter.
 * Production callers (`ml-dsa-eth.ts#signUserOp`) use this variant;
 * the G2 KAT test uses the instrumented variant to assert AC-4-5.
 */
export function signWithXof(
  sk: Uint8Array,
  msg: Uint8Array,
  rnd: Uint8Array,
  ctx: Uint8Array,
  xofFactory: XofFactory,
): Uint8Array {
  return signWithXofInstrumented(sk, msg, rnd, ctx, xofFactory).signature;
}
