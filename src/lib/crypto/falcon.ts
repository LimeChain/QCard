/**
 * Browser-side Falcon (FN-DSA-512) wrapper.
 *
 * Uses Thomas Pornin's reference JS implementation (vendored fndsa.js).
 * See: https://github.com/pornin/js-fn-dsa
 *
 * SECURITY WARNING: JavaScript cannot guarantee constant-time execution.
 * Key generation and signing may leak timing information through
 * branch prediction, cache behaviour, and BigInt operations. This is
 * acceptable for a proof-of-concept. DO NOT use in production without
 * moving to a WASM or native implementation with constant-time guarantees.
 */

import { keygen, sign, verify, ID_RAW } from './fndsa';
import type { FNDSAKeyPair } from './fndsa';

/**
 * Generate a Falcon-512 (FN-DSA-512) key pair.
 *
 * This is CPU-intensive (~200-800 ms). Consider running in a Web Worker
 * to avoid blocking the main thread.
 */
export function generateFalconKeypair(): {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
} {
  const kp: FNDSAKeyPair = keygen(9); // logn=9 → FN-DSA-512
  return {
    publicKey: kp.verify_key,
    secretKey: kp.sign_key,
  };
}

/**
 * Sign a message with a Falcon-512 secret key.
 *
 * Uses ID_RAW (no pre-hashing) and an empty context string.
 * The caller should pass the raw message bytes (e.g. a keccak256 hash).
 */
export function signFalcon(
  secretKey: Uint8Array,
  message: Uint8Array,
): Uint8Array {
  return sign(secretKey, '', ID_RAW, message);
}

/**
 * Verify a Falcon-512 signature against a public key and message.
 */
export function verifyFalcon(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array,
): boolean {
  return verify(signature, publicKey, '', ID_RAW, message);
}
