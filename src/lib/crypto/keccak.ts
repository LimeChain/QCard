/**
 * EVM-compatible Keccak-256 wrapper.
 *
 * Uses js-sha3's `keccak256` (NOT sha3_256) — this matches
 * the EVM KECCAK256 opcode and Solidity's keccak256() built-in.
 */

import { keccak256 as _keccak256 } from 'js-sha3';

/**
 * Hash `data` with Keccak-256 and return 32 raw bytes.
 *
 * Matches: `keccak256(...)` in Solidity / the EVM KECCAK256 opcode.
 */
export function keccak256(data: Uint8Array): Uint8Array {
  // js-sha3 .digest() returns number[], convert to Uint8Array
  return new Uint8Array(_keccak256.digest(data));
}

/**
 * Hash `data` with Keccak-256 and return a 0x-prefixed hex string.
 */
export function keccak256Hex(data: Uint8Array): string {
  return '0x' + _keccak256(data);
}
