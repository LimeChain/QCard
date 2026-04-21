/**
 * Contract addresses on Sepolia.
 * Read from NEXT_PUBLIC_* environment variables.
 * Set them in .env.local (see .env.example).
 */
export const ADDRESSES = {
  entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789' as const,
  entryPointV07: (process.env.NEXT_PUBLIC_ENTRYPOINT_V07 ?? '0x0000000071727De22E5E9d8BAf0edAc6f37da032') as `0x${string}`,
  hcaFactory: (process.env.NEXT_PUBLIC_HCA_FACTORY ?? '') as `0x${string}`,
  lamportVerifier: (process.env.NEXT_PUBLIC_LAMPORT_VERIFIER ?? '') as `0x${string}`,
  ecdsaVerifier: (process.env.NEXT_PUBLIC_ECDSA_VERIFIER ?? '') as `0x${string}`,
  falconVerifier: (process.env.NEXT_PUBLIC_FALCON_VERIFIER ?? '') as `0x${string}`,
  pqc4337Factory: (process.env.NEXT_PUBLIC_PQC4337_FACTORY ?? '') as `0x${string}`,
  falconEthVerifier: (process.env.NEXT_PUBLIC_FALCON_ETH_VERIFIER ?? '') as `0x${string}`,
  mldsaEthVerifier: (process.env.NEXT_PUBLIC_MLDSA_ETH_VERIFIER ?? '') as `0x${string}`,
} as const
