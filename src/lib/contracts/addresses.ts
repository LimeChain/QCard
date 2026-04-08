/**
 * Contract addresses on Sepolia.
 * Read from NEXT_PUBLIC_* environment variables.
 * Set them in .env.local (see .env.example).
 */
export const ADDRESSES = {
  entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789' as const,
  hcaFactory: (process.env.NEXT_PUBLIC_HCA_FACTORY ?? '') as `0x${string}`,
  lamportVerifier: (process.env.NEXT_PUBLIC_LAMPORT_VERIFIER ?? '') as `0x${string}`,
  ecdsaVerifier: (process.env.NEXT_PUBLIC_ECDSA_VERIFIER ?? '') as `0x${string}`,
  falconVerifier: (process.env.NEXT_PUBLIC_FALCON_VERIFIER ?? '') as `0x${string}`,
} as const
