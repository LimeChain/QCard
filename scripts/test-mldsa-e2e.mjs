import { ml_dsa44eth } from "@noble/post-quantum/ml-dsa.js"
import { encodeMlDsaPublicKey, keccakXofFactory } from "@noble/post-quantum/utils-eth.js"
import {
  bytesToHex,
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  encodeFunctionData,
  http,
  parseAbi,
  parseEther,
  toHex,
  padHex,
  concatHex,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"

const RPC = "http://127.0.0.1:8546"
const FACTORY = "0x270214065eE827B8598D3eC264fe1aeA547eD441"
const ENTRY_POINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032"
const anvilPk = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
const anvilAcct = privateKeyToAccount(anvilPk)

const pub = createPublicClient({ transport: http(RPC) })
const wallet = createWalletClient({ account: anvilAcct, transport: http(RPC) })

const factoryAbi = parseAbi([
  "function createMlDsaEthAccountWithKey(address owner, bytes encodedPublicKey, uint256 salt) external returns (address account, bytes publicKeyPointer)",
  "event MlDsaEthAccountCreated(address indexed account, address indexed owner, bytes publicKeyPointer)",
])
const epAbi = parseAbi([
  "struct PackedUserOperation { address sender; uint256 nonce; bytes initCode; bytes callData; bytes32 accountGasLimits; uint256 preVerificationGas; bytes32 gasFees; bytes paymasterAndData; bytes signature; }",
  "function handleOps(PackedUserOperation[] ops, address beneficiary) external",
  "function getUserOpHash(PackedUserOperation op) external view returns (bytes32)",
  "function depositTo(address) external payable",
])
const acctExecAbi = parseAbi([
  "function execute(address target, uint256 value, bytes data) external",
])

const { publicKey, secretKey } = ml_dsa44eth.keygen()
const encodedPkBytes = encodeMlDsaPublicKey(publicKey, keccakXofFactory, keccakXofFactory)
const encodedPkHex = bytesToHex(encodedPkBytes)
console.log("encoded pk:", encodedPkHex.length, "hex chars")

const salt = BigInt(Date.now())
const { result, request } = await pub.simulateContract({
  address: FACTORY,
  abi: factoryAbi,
  functionName: "createMlDsaEthAccountWithKey",
  args: [anvilAcct.address, encodedPkHex, salt],
  account: anvilAcct,
})
const [predictedAccount, predictedPointer] = result
console.log("predicted account:", predictedAccount)
console.log("predicted pointer:", predictedPointer)

const createTx = await wallet.writeContract(request)
const createRcpt = await pub.waitForTransactionReceipt({ hash: createTx })
if (createRcpt.status !== "success") {
  console.error("create FAILED", createRcpt)
  process.exit(1)
}

let accountAddr = null
let pointer = null
for (const log of createRcpt.logs) {
  if (log.address.toLowerCase() !== FACTORY.toLowerCase()) continue
  try {
    const d = decodeEventLog({ abi: factoryAbi, data: log.data, topics: log.topics })
    if (d.eventName === "MlDsaEthAccountCreated") {
      accountAddr = d.args.account
      pointer = d.args.publicKeyPointer
      break
    }
  } catch {}
}
console.log("account:", accountAddr, "pointer:", pointer)

// fund account generously
await wallet.sendTransaction({ to: accountAddr, value: parseEther("5") })

const callData = encodeFunctionData({
  abi: acctExecAbi, functionName: "execute",
  args: ["0x000000000000000000000000000000000000dEaD", parseEther("0.001"), "0x"],
})

// Probe: what gas does mldsa verify actually need? Try the real prod value 3M first, then 8M.
const VERIF = BigInt(process.env.VERIF ?? 3_000_000)
console.log("trying verificationGasLimit:", VERIF)
const accountGasLimits = concatHex([padHex(toHex(VERIF), { size: 16 }), padHex(toHex(500_000n), { size: 16 })])
const gasFees = concatHex([padHex(toHex(2_000_000_000n), { size: 16 }), padHex(toHex(20_000_000_000n), { size: 16 })])

const unsigned = {
  sender: accountAddr,
  nonce: 0n,
  initCode: "0x",
  callData,
  accountGasLimits,
  preVerificationGas: 200_000n,
  gasFees,
  paymasterAndData: "0x",
  signature: "0x",
}

const userOpHash = await pub.readContract({
  address: ENTRY_POINT, abi: epAbi, functionName: "getUserOpHash", args: [unsigned],
})
console.log("userOpHash:", userOpHash)

const sig = ml_dsa44eth.sign(Buffer.from(userOpHash.slice(2), "hex"), secretKey)
const sigHex = bytesToHex(sig)
console.log("sig len:", sig.length)

const signed = { ...unsigned, signature: sigHex }

try {
  const { request: req2 } = await pub.simulateContract({
    address: ENTRY_POINT, abi: epAbi, functionName: "handleOps",
    args: [[signed], anvilAcct.address],
    account: anvilAcct,
  })
  const txHash = await wallet.writeContract(req2)
  const rcpt = await pub.waitForTransactionReceipt({ hash: txHash })
  console.log("handleOps status:", rcpt.status, "gasUsed:", rcpt.gasUsed)
} catch (e) {
  console.error("handleOps FAILED:", e.shortMessage || e.message)
  console.error("cause data:", e.cause?.data ?? e.data ?? "none")
  console.error("raw cause:", e.cause?.reason ?? e.cause?.message ?? "")
  console.error(e.stack?.split("\n").slice(0, 5).join("\n"))
}
