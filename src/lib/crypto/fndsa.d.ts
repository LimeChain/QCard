/**
 * Type declarations for the vendored fndsa.js (Thomas Pornin's FN-DSA).
 * See: https://github.com/pornin/js-fn-dsa
 */

export interface FNDSAKeyPair {
  sign_key: Uint8Array;
  verify_key: Uint8Array;
}

/**
 * Generate a new FN-DSA key pair.
 * @param logn - 9 for FN-DSA-512, 10 for FN-DSA-1024
 */
export function keygen(logn: number): FNDSAKeyPair;

/**
 * Sign data with an FN-DSA signing key.
 * @param sk  - signing key (from keygen().sign_key)
 * @param ctx - context string for domain separation (max 255 bytes)
 * @param id  - pre-hashing identifier (use ID_RAW for raw messages)
 * @param hv  - the message (or pre-hashed value)
 */
export function sign(
  sk: Uint8Array,
  ctx: Uint8Array | string,
  id: Uint8Array,
  hv: Uint8Array | string,
): Uint8Array;

/**
 * Verify an FN-DSA signature.
 * @param sig - the signature
 * @param vk  - verifying key (from keygen().verify_key)
 * @param ctx - context string for domain separation
 * @param id  - pre-hashing identifier (use ID_RAW for raw messages)
 * @param hv  - the message (or pre-hashed value)
 */
export function verify(
  sig: Uint8Array,
  vk: Uint8Array,
  ctx: Uint8Array | string,
  id: Uint8Array,
  hv: Uint8Array | string,
): boolean;

/** Pre-hashing ID: no pre-hashing (raw message). */
export const ID_RAW: Uint8Array;
