/**
 * ERC-4337 v0.6 UserOperation hash computation.
 * Matches the EntryPoint's getUserOpHash() exactly.
 */

import { encodeAbiParameters, parseAbiParameters, keccak256, concat, toHex, pad } from 'viem'
import type { UserOperationV06 } from './pimlico'

const ENTRY_POINT = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789' as const

/**
 * Pack a UserOperation for hashing (v0.6 format).
 * This matches the Solidity: keccak256(abi.encode(sender, nonce, keccak256(initCode), keccak256(callData),
 *   callGasLimit, verificationGasLimit, preVerificationGas, maxFeePerGas, maxPriorityFeePerGas, keccak256(paymasterAndData)))
 */
export function packUserOp(userOp: UserOperationV06): `0x${string}` {
  const initCodeHash = keccak256(userOp.initCode)
  const callDataHash = keccak256(userOp.callData)
  const paymasterDataHash = keccak256(userOp.paymasterAndData)

  return encodeAbiParameters(
    parseAbiParameters('address, uint256, bytes32, bytes32, uint256, uint256, uint256, uint256, uint256, bytes32'),
    [
      userOp.sender,
      BigInt(userOp.nonce),
      initCodeHash,
      callDataHash,
      BigInt(userOp.callGasLimit),
      BigInt(userOp.verificationGasLimit),
      BigInt(userOp.preVerificationGas),
      BigInt(userOp.maxFeePerGas),
      BigInt(userOp.maxPriorityFeePerGas),
      paymasterDataHash,
    ],
  )
}

/**
 * Compute the userOpHash that the EntryPoint will pass to validateUserOp.
 */
export function getUserOpHash(userOp: UserOperationV06, chainId: number): `0x${string}` {
  const packed = packUserOp(userOp)
  const packedHash = keccak256(packed)

  return keccak256(
    encodeAbiParameters(
      parseAbiParameters('bytes32, address, uint256'),
      [packedHash, ENTRY_POINT, BigInt(chainId)],
    ),
  )
}
