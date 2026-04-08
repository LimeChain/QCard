/**
 * Compatibility verification script.
 *
 * Generates a Lamport account with seed "test-seed-1" and 16 leaves,
 * then prints the account root for comparison against the Python signer.
 *
 * Run with: npx tsx src/lib/crypto/verify-compat.ts
 *
 * Expected (from Python lamport_signer.py):
 *   0xd39086d448cbc54110a6b06c1a2c1ba2fbaf7f1c759c5cd05f4a74686104684b
 */

import { deriveMasterSeedFromString, generateAccountRoots } from './lamport';
import { keccak256Hex } from './keccak';

const SEED_STRING = 'test-seed-1';
const LEAF_COUNT = 16;
const EXPECTED =
  '0xd39086d448cbc54110a6b06c1a2c1ba2fbaf7f1c759c5cd05f4a74686104684b';

function toHex(bytes: Uint8Array): string {
  return (
    '0x' +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  );
}

function main(): void {
  console.log(`Seed string: "${SEED_STRING}"`);
  console.log(`Leaf count:  ${LEAF_COUNT}`);
  console.log();

  const masterSeed = deriveMasterSeedFromString(SEED_STRING);
  console.log(`Master seed: ${toHex(masterSeed)}`);

  const { leafRoots, accountRoot } = generateAccountRoots(
    masterSeed,
    LEAF_COUNT,
  );

  console.log(`Leaf root 0: ${toHex(leafRoots[0])}`);
  console.log();
  console.log(`Account root (JS):     ${toHex(accountRoot)}`);
  console.log(`Account root (Python): ${EXPECTED}`);
  console.log();

  if (toHex(accountRoot) === EXPECTED) {
    console.log('PASS — JS output matches Python signer');
  } else {
    console.error('FAIL — mismatch between JS and Python');
    process.exit(1);
  }
}

main();
