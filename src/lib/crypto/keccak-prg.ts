/**
 * Keccak-256 PRG — byte-compatible port of ZKNox's `Keccak256PRNG`
 * (see `ETHDILITHIUM/pythonref/dilithium_py/keccak_prng/keccak_prng_wrapper.py`
 * and `ETHDILITHIUM/src/ZKNOX_keccak_prng.sol`). Landed for Story 2, Task 1.
 *
 * Three-phase one-way state machine (DD-11):
 *
 *   1. Absorb  — `inject(data)` appends to a 4096-byte internal buffer.
 *                Multiple calls concatenate. Disallowed after `flip()`.
 *   2. Flip    — `flip()` finalizes: `state = keccak256(buffer[:bufferLen])`
 *                (exactly one Keccak call, 32-byte output). One-shot.
 *   3. Extract — `extract(n)` streams pseudorandom bytes by iterating
 *                `out_buffer = keccak256(state || u64_be(counter))` and
 *                copying at most 32 bytes per iteration; partial blocks
 *                persist in `outBuffer[outBufferPos : outBufferLen]` so
 *                that `extract(5) + extract(27)` on one instance matches
 *                `extract(32)` on a freshly-seeded instance (AC-2-2).
 *
 * The `update` / `read` aliases mirror Python's SHAKE-parity surface so
 * the Story-3 XOF-factory adapter can hand a SHAKE-shaped object to
 * call-sites without per-XOF branching.
 *
 * ACs covered by this module + its co-located unit tests:
 *   - AC-2-4 (inject-after-flip → `PRG_INJECT_AFTER_FLIP`)
 *   - AC-2-5 (extract-before-flip → `PRG_EXTRACT_BEFORE_FLIP`)
 *   - Foundational for AC-2-1, AC-2-2, AC-2-3, AC-2-6 (downstream tasks
 *     and stories construct instances via `createKeccakPrg`).
 */

import { keccak256 } from "viem";

/** Maximum cumulative inject size. Matches Python ref line 17. */
const MAX_BUFFER_SIZE = 4096;

/** Keccak-256 output size (bytes). */
const KECCAK_OUTPUT = 32;

/** Discriminant codes for `PrgLifecycleError`. Tests assert on `code`. */
export type PrgLifecycleCode =
  | "PRG_INJECT_AFTER_FLIP"
  | "PRG_EXTRACT_BEFORE_FLIP"
  | "PRG_DOUBLE_FLIP"
  | "PRG_BUFFER_OVERFLOW";

/**
 * Structured error thrown when the PRG state machine is driven out of
 * sequence or the inject buffer would overflow. Consumers discriminate
 * on `code` (never message text) — matches the established `readonly
 * code` pattern in `test/signers/errors.ts` and
 * `test/fixtures/kat/index.ts`.
 */
export class PrgLifecycleError extends Error {
  readonly code: PrgLifecycleCode;

  constructor(
    message: string,
    code: PrgLifecycleCode,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "PrgLifecycleError";
    this.code = code;
  }
}

/**
 * Keccak-PRG primitive surface. Instances are stateful — construct a
 * fresh one per caller. Never share instances across unrelated call
 * sites.
 */
export interface KeccakPrg {
  /** Absorb `data` into the buffer. Throws after `flip()`. */
  inject(data: Uint8Array): void;
  /** Finalize the state. One-shot — throws if called twice. */
  flip(): void;
  /** Stream `length` pseudorandom bytes. Throws before `flip()`. */
  extract(length: number): Uint8Array;
  /** SHAKE-parity alias for `inject`. */
  update(data: Uint8Array): void;
  /** SHAKE-parity alias for `extract`. */
  read(length: number): Uint8Array;
}

/**
 * Construct a fresh Keccak-PRG instance.
 *
 * Optional `seed` is equivalent to `const p = createKeccakPrg(); p.inject(seed);`
 * — it does NOT auto-flip. The caller must call `flip()` before any
 * `extract()` (mirroring Python's `Keccak256PRNG.__init__` at
 * `keccak_prng_wrapper.py:36-39`).
 */
export function createKeccakPrg(seed?: Uint8Array): KeccakPrg {
  // --- internal state (closed-over; no module-level state per DD-11) ---
  const buffer = new Uint8Array(MAX_BUFFER_SIZE);
  let bufferLen = 0;
  let finalized = false;
  let state: Uint8Array<ArrayBufferLike> = new Uint8Array(KECCAK_OUTPUT);

  // Streaming output state.
  let outBuffer: Uint8Array<ArrayBufferLike> = new Uint8Array(KECCAK_OUTPUT);
  let outBufferPos = 0;
  let outBufferLen = 0;

  // bigint u64 counter — matches Python's arbitrary-precision int and
  // avoids JS Number's 2^53-1 safe-integer ceiling. Packed big-endian
  // via DataView.setBigUint64(..., false) during extract.
  let counter = BigInt(0);

  // Scratch block for the extract hash: state(32) || u64_be(counter)(8).
  const block = new Uint8Array(KECCAK_OUTPUT + 8);
  const blockView = new DataView(block.buffer);

  function inject(data: Uint8Array): void {
    if (finalized) {
      throw new PrgLifecycleError(
        "Cannot inject after flip",
        "PRG_INJECT_AFTER_FLIP",
      );
    }
    if (bufferLen + data.length > MAX_BUFFER_SIZE) {
      throw new PrgLifecycleError(
        `Buffer overflow: ${bufferLen + data.length} > ${MAX_BUFFER_SIZE}`,
        "PRG_BUFFER_OVERFLOW",
      );
    }
    buffer.set(data, bufferLen);
    bufferLen += data.length;
  }

  function flip(): void {
    if (finalized) {
      throw new PrgLifecycleError(
        "Already finalized",
        "PRG_DOUBLE_FLIP",
      );
    }
    // Single-shot hash of absorbed buffer. Empty-seed path: buffer[:0]
    // is the empty byte-string; keccak256(empty) is defined and matches
    // the `prg-empty-seed` fixture.
    state = keccak256(buffer.subarray(0, bufferLen), "bytes");
    finalized = true;
    outBufferPos = 0;
    outBufferLen = 0;
  }

  function extract(length: number): Uint8Array {
    if (!finalized) {
      throw new PrgLifecycleError(
        "PRG not finalized; call flip() before extract()",
        "PRG_EXTRACT_BEFORE_FLIP",
      );
    }

    const output = new Uint8Array(length);
    let offset = 0;

    // (1) Drain any leftover bytes from the previous extract call. This
    //     is load-bearing: extract(5) then extract(27) must NOT advance
    //     the counter — they read bytes [0..5) and [5..32) of the same
    //     block, respectively.
    if (outBufferLen > outBufferPos) {
      const available = outBufferLen - outBufferPos;
      const toCopy = Math.min(length, available);
      output.set(outBuffer.subarray(outBufferPos, outBufferPos + toCopy), 0);
      outBufferPos += toCopy;
      offset += toCopy;
      if (offset === length) return output;
    }

    // (2) Generate fresh blocks until the request is satisfied. Counter
    //     packed big-endian as u64 into bytes [32..40) of the block —
    //     matches Python's struct.pack('>Q', counter) and the Solidity
    //     reference's shl(192, counter) MSB placement.
    while (offset < length) {
      block.set(state, 0);
      blockView.setBigUint64(KECCAK_OUTPUT, counter, false); // false = big-endian
      outBuffer = keccak256(block, "bytes");
      outBufferLen = KECCAK_OUTPUT;
      outBufferPos = 0;

      const remaining = length - offset;
      const toCopy = Math.min(remaining, KECCAK_OUTPUT);
      output.set(outBuffer.subarray(0, toCopy), offset);
      outBufferPos = toCopy;
      offset += toCopy;

      counter += BigInt(1);
    }

    return output;
  }

  // SHAKE-parity aliases (mirror `keccak_prng_wrapper.py:124-130`).
  function update(data: Uint8Array): void {
    inject(data);
  }
  function read(length: number): Uint8Array {
    return extract(length);
  }

  // Optional ctor seed ≡ immediate inject.
  if (seed !== undefined && seed.length > 0) {
    inject(seed);
  }

  return { inject, flip, extract, update, read };
}
