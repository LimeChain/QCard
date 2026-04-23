import { ml_dsa44eth } from "@noble/post-quantum/ml-dsa.js"
import { encodeMlDsaPublicKey, keccakXofFactory } from "@noble/post-quantum/utils-eth.js"
import {
  bytesToHex,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  hexToBytes,
  http,
  parseAbi,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"

const RPC = "http://127.0.0.1:8546"
const MLDSA_VERIFIER = "0xC9F8b4e6609Ef977bBE74A32c23934F493D29cAA"

const anvilPk = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
const account = privateKeyToAccount(anvilPk)

const pub = createPublicClient({ transport: http(RPC) })
const wallet = createWalletClient({ account, transport: http(RPC) })

const abi = parseAbi([
  "function setKey(bytes pubkey) external returns (bytes)",
  "function verify(bytes calldata pk, bytes32 m, bytes calldata signature) external view returns (bytes4)",
])

const { publicKey, secretKey } = ml_dsa44eth.keygen()
const encodedPk = encodeMlDsaPublicKey(publicKey, keccakXofFactory, keccakXofFactory)
const encodedPkHex = bytesToHex(encodedPk)

const msgBytes = new Uint8Array(32)
for (let i = 0; i < 32; i++) msgBytes[i] = i + 1
const msgHex = bytesToHex(msgBytes)

const sig = ml_dsa44eth.sign(msgBytes, secretKey)
const sigHex = bytesToHex(sig)

const nobleSelfVerify = ml_dsa44eth.verify(sig, msgBytes, publicKey)
console.log("noble self-verify:", nobleSelfVerify, "sigLen:", sig.length)

console.log("simulating setKey to capture pointer return value...")
const { result: pointerFromSim, request } = await pub.simulateContract({
  address: MLDSA_VERIFIER,
  abi,
  functionName: "setKey",
  args: [encodedPkHex],
  account,
})
console.log("calling setKey...")
const setKeyHash = await wallet.writeContract(request)
const setKeyRcpt = await pub.waitForTransactionReceipt({ hash: setKeyHash })
console.log("setKey status:", setKeyRcpt.status)
const pointer = pointerFromSim
console.log("pkPointer:", pointer)

console.log("calling verify...")
try {
  const selector = await pub.readContract({
    address: MLDSA_VERIFIER,
    abi,
    functionName: "verify",
    args: [pointer, msgHex, sigHex],
  })
  console.log("verify selector:", selector)
  const expected = "0x024ad318"
  console.log("match expected ISigVerifier.verify.selector:", selector === expected, "(expected:", expected, ")")
} catch (e) {
  console.error("verify REVERTED:", e.shortMessage || e.message)
}
