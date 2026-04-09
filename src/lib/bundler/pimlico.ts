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

export interface UserOpReceipt {
  userOpHash: string
  transactionHash: string
  success: boolean
}

function bundlerUrl(apiKey: string, chainId: number): string {
  return `https://api.pimlico.io/v2/${chainId}/rpc?apikey=${apiKey}`
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
  const url = bundlerUrl(apiKey, chainId)
  const result = await rpc(url, 'eth_estimateUserOperationGas', [
    userOp,
    '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
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
  const url = bundlerUrl(apiKey, chainId)
  const hash = await rpc(url, 'eth_sendUserOperation', [
    userOp,
    '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
  ]) as string
  return hash
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
