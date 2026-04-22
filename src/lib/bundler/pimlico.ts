/**
 * Pimlico bundler JSON-RPC helpers for ERC-4337 v0.6.
 *
 * Handles gas estimation, UserOp submission, and receipt polling.
 * Falls back to direct wallet execution if no API key is set.
 */

export interface UserOperationV06 {
  sender: `0x${string}`
  nonce: `0x${string}`
  initCode: `0x${string}`
  callData: `0x${string}`
  callGasLimit: `0x${string}`
  verificationGasLimit: `0x${string}`
  preVerificationGas: `0x${string}`
  maxFeePerGas: `0x${string}`
  maxPriorityFeePerGas: `0x${string}`
  paymasterAndData: `0x${string}`
  signature: `0x${string}`
}

export interface UserOperationV07 {
  sender: `0x${string}`
  nonce: `0x${string}`
  initCode: `0x${string}`
  callData: `0x${string}`
  accountGasLimits: `0x${string}`
  preVerificationGas: `0x${string}`
  gasFees: `0x${string}`
  paymasterAndData: `0x${string}`
  signature: `0x${string}`
}

interface UserOperationV07Rpc {
  sender: `0x${string}`
  nonce: `0x${string}`
  callData: `0x${string}`
  callGasLimit: `0x${string}`
  verificationGasLimit: `0x${string}`
  preVerificationGas: `0x${string}`
  maxFeePerGas: `0x${string}`
  maxPriorityFeePerGas: `0x${string}`
  signature: `0x${string}`
  factory?: `0x${string}`
  factoryData?: `0x${string}`
  paymaster?: `0x${string}`
  paymasterVerificationGasLimit?: `0x${string}`
  paymasterPostOpGasLimit?: `0x${string}`
  paymasterData?: `0x${string}`
}

export interface UserOpReceipt {
  userOpHash: string
  transactionHash: string
  success: boolean
}

const ENTRY_POINT_V06 = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789' as const

function bundlerUrl(apiKey: string, chainId: number): string {
  return `https://api.pimlico.io/v2/${chainId}/rpc?apikey=${apiKey}`
}

function splitPacked128(packedHex: `0x${string}`): { low: `0x${string}`; high: `0x${string}` } {
  const packed = BigInt(packedHex)
  const mask = (BigInt(1) << BigInt(128)) - BigInt(1)
  const low = `0x${(packed & mask).toString(16)}` as `0x${string}`
  const high = `0x${((packed >> BigInt(128)) & mask).toString(16)}` as `0x${string}`
  return { low, high }
}

function decodeInitCode(initCode: `0x${string}`): { factory?: `0x${string}`; factoryData?: `0x${string}` } {
  if (initCode === "0x") return {}
  const raw = initCode.slice(2)
  if (raw.length < 40) return {}
  return {
    factory: `0x${raw.slice(0, 40)}` as `0x${string}`,
    factoryData: `0x${raw.slice(40)}` as `0x${string}`,
  }
}

function decodePaymasterAndData(
  paymasterAndData: `0x${string}`,
): {
  paymaster?: `0x${string}`
  paymasterVerificationGasLimit?: `0x${string}`
  paymasterPostOpGasLimit?: `0x${string}`
  paymasterData?: `0x${string}`
} {
  if (paymasterAndData === "0x") return {}
  const raw = paymasterAndData.slice(2)
  if (raw.length < 40 + 32 + 32) return {}
  return {
    paymaster: `0x${raw.slice(0, 40)}` as `0x${string}`,
    paymasterVerificationGasLimit: `0x${BigInt(`0x${raw.slice(40, 72)}`).toString(16)}` as `0x${string}`,
    paymasterPostOpGasLimit: `0x${BigInt(`0x${raw.slice(72, 104)}`).toString(16)}` as `0x${string}`,
    paymasterData: `0x${raw.slice(104)}` as `0x${string}`,
  }
}

function toRpcUserOperationV07(userOp: UserOperationV07): UserOperationV07Rpc {
  const gas = splitPacked128(userOp.accountGasLimits)
  const fees = splitPacked128(userOp.gasFees)
  return {
    sender: userOp.sender,
    nonce: userOp.nonce,
    callData: userOp.callData,
    callGasLimit: gas.low,
    verificationGasLimit: gas.high,
    preVerificationGas: userOp.preVerificationGas,
    maxFeePerGas: fees.low,
    maxPriorityFeePerGas: fees.high,
    signature: userOp.signature,
    ...decodeInitCode(userOp.initCode),
    ...decodePaymasterAndData(userOp.paymasterAndData),
  }
}

async function rpc(url: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
  })

  const json = await res.json()
  if (json.error) {
    // Extract detailed error data if available
    const errMsg = json.error.message ?? ''
    const errData = json.error.data ? ` | Data: ${JSON.stringify(json.error.data)}` : ''
    throw new Error(`Bundler RPC error: ${errMsg}${errData}`)
  }
  return json.result
}

/**
 * Estimate gas limits for a UserOperation via Pimlico's bundler.
 */
export async function estimateUserOpGas(
  userOp: UserOperationV06,
  apiKey: string,
  chainId: number,
): Promise<{
  callGasLimit: `0x${string}`
  verificationGasLimit: `0x${string}`
  preVerificationGas: `0x${string}`
}> {
  return estimateUserOpGasForEntryPoint(userOp, apiKey, chainId, ENTRY_POINT_V06)
}

export async function estimateUserOpGasForEntryPoint(
  userOp: UserOperationV06 | UserOperationV07 | UserOperationV07Rpc,
  apiKey: string,
  chainId: number,
  entryPoint: `0x${string}`,
): Promise<{
  callGasLimit: `0x${string}`
  verificationGasLimit: `0x${string}`
  preVerificationGas: `0x${string}`
}> {
  const url = bundlerUrl(apiKey, chainId)
  const result = await rpc(url, 'eth_estimateUserOperationGas', [
    userOp,
    entryPoint,
  ]) as Record<string, string>

  return {
    callGasLimit: result.callGasLimit as `0x${string}`,
    verificationGasLimit: result.verificationGasLimit as `0x${string}`,
    preVerificationGas: result.preVerificationGas as `0x${string}`,
  }
}

/**
 * Ask Pimlico for the gas price tiers it will actually accept for a UserOperation.
 * Using these values avoids "maxFeePerGas too low" rejections and aligns with
 * what Pimlico itself uses internally during simulation.
 */
export async function getPimlicoGasPrice(
  apiKey: string,
  chainId: number,
): Promise<{
  maxFeePerGas: `0x${string}`
  maxPriorityFeePerGas: `0x${string}`
}> {
  const url = bundlerUrl(apiKey, chainId)
  const result = await rpc(url, 'pimlico_getUserOperationGasPrice', []) as {
    standard: { maxFeePerGas: `0x${string}`; maxPriorityFeePerGas: `0x${string}` }
  }
  return result.standard
}

/**
 * Submit a UserOperation to Pimlico's bundler.
 * Returns the userOpHash.
 */
export async function sendUserOperation(
  userOp: UserOperationV06,
  apiKey: string,
  chainId: number,
): Promise<string> {
  return sendUserOperationForEntryPoint(userOp, apiKey, chainId, ENTRY_POINT_V06)
}

export async function sendUserOperationForEntryPoint(
  userOp: UserOperationV06 | UserOperationV07 | UserOperationV07Rpc,
  apiKey: string,
  chainId: number,
  entryPoint: `0x${string}`,
): Promise<string> {
  const url = bundlerUrl(apiKey, chainId)
  const hash = await rpc(url, 'eth_sendUserOperation', [
    userOp,
    entryPoint,
  ]) as string
  return hash
}

export async function estimateUserOpGasV07(
  userOp: UserOperationV07,
  apiKey: string,
  chainId: number,
  entryPoint: `0x${string}`,
) {
  return estimateUserOpGasForEntryPoint(toRpcUserOperationV07(userOp), apiKey, chainId, entryPoint)
}

export async function sendUserOperationV07(
  userOp: UserOperationV07,
  apiKey: string,
  chainId: number,
  entryPoint: `0x${string}`,
): Promise<string> {
  return sendUserOperationForEntryPoint(toRpcUserOperationV07(userOp), apiKey, chainId, entryPoint)
}

/**
 * Poll for a UserOperation receipt until it's available.
 */
export async function getUserOperationReceipt(
  userOpHash: string,
  apiKey: string,
  chainId: number,
  maxAttempts = 30,
  intervalMs = 2000,
): Promise<UserOpReceipt | null> {
  const url = bundlerUrl(apiKey, chainId)

  for (let i = 0; i < maxAttempts; i++) {
    const result = await rpc(url, 'eth_getUserOperationReceipt', [userOpHash])
    if (result) {
      const receipt = result as Record<string, unknown>
      return {
        userOpHash,
        transactionHash: receipt.receipt
          ? (receipt.receipt as Record<string, string>).transactionHash
          : (receipt.transactionHash as string) ?? '',
        success: receipt.success === true,
      }
    }
    await new Promise(r => setTimeout(r, intervalMs))
  }
  return null
}
