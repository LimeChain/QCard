import { encodeAbiParameters, keccak256, parseAbiParameters, toHex } from "viem"
import type { UserOperationV07 } from "./pimlico"

export function packAccountGasLimits(callGasLimit: bigint, verificationGasLimit: bigint): `0x${string}` {
  const packed = (verificationGasLimit << BigInt(128)) | callGasLimit
  return toHex(packed, { size: 32 })
}

export function packGasFees(maxFeePerGas: bigint, maxPriorityFeePerGas: bigint): `0x${string}` {
  const packed = (maxPriorityFeePerGas << BigInt(128)) | maxFeePerGas
  return toHex(packed, { size: 32 })
}

export function packUserOpV07(userOp: UserOperationV07): `0x${string}` {
  return encodeAbiParameters(
    parseAbiParameters("address, uint256, bytes32, bytes32, bytes32, uint256, bytes32, bytes32"),
    [
      userOp.sender,
      BigInt(userOp.nonce),
      keccak256(userOp.initCode),
      keccak256(userOp.callData),
      userOp.accountGasLimits,
      BigInt(userOp.preVerificationGas),
      userOp.gasFees,
      keccak256(userOp.paymasterAndData),
    ],
  )
}

export function getUserOpHashV07(
  userOp: UserOperationV07,
  chainId: number,
  entryPoint: `0x${string}`,
): `0x${string}` {
  const packedHash = keccak256(packUserOpV07(userOp))
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters("bytes32, address, uint256"),
      [packedHash, entryPoint, BigInt(chainId)],
    ),
  )
}
