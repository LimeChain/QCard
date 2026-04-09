import * as React from "react"
import { Button } from "../ui/Button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/Card"
import { Input } from "../ui/Input"
import { CodeBlock } from "../ui/CodeBlock"
import { Badge } from "../ui/Badge"
import { ArrowRight, KeyRound, Server, ChevronDown, ChevronUp } from "lucide-react"
import { useWizard } from "@/lib/store"
import { useAccount, usePublicClient } from "wagmi"
import { getWalletClient } from "wagmi/actions"
import { config } from "@/lib/wagmi"
import { encodeFunctionData, encodeAbiParameters, parseAbiParameters, parseEther, toHex as viemToHex } from "viem"
import { signMessage as lamportSign, generateLeafKeypair, buildMerkleProof } from "@/lib/crypto"
import { buildHCAMerkleProof } from "@/lib/crypto/hca-keygen"
import { keccak256 } from "@/lib/crypto"
import { hcaAccountAbi } from "@/lib/contracts/abis"
import { sendUserOperation, getUserOperationReceipt, getPimlicoGasPrice, type UserOperationV06 } from "@/lib/bundler/pimlico"
import { getUserOpHash } from "@/lib/bundler/userop"

function bytesToHex(bytes: Uint8Array): `0x${string}` {
  return ('0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`
}

function bytes32ArrayToHex(arr: Uint8Array[]): `0x${string}`[] {
  return arr.map(bytesToHex)
}

const VERSION_LAMPORT = 0x01
const VERSION_FALCON = 0x02
const VERSION_ECDSA = 0x03

const SCHEME_VERSIONS: Record<string, number> = {
  Lamport: VERSION_LAMPORT,
  Falcon: VERSION_FALCON,
  ECDSA: VERSION_ECDSA,
}

export function SignSubmit({ onNext, onBack }: { onNext: () => void, onBack: () => void }) {
  const wizard = useWizard()
  const { address: walletAddress } = useAccount()
  const publicClient = usePublicClient()

  const [selectedLeafIndex, setSelectedLeafIndex] = React.useState<number | null>(null)
  const [toAddress, setToAddress] = React.useState("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")
  const [amount, setAmount] = React.useState("0.001")
  const [isSigning, setIsSigning] = React.useState(false)
  const [signStatus, setSignStatus] = React.useState("")
  const [signatureHex, setSignatureHex] = React.useState("")
  const [sigMeta, setSigMeta] = React.useState<{ scheme: string; leafIndex: number; proofLen: number; sigBytes: number; userOpHash: string } | null>(null)
  const [builtUserOp, setBuiltUserOp] = React.useState<UserOperationV06 | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [submitStatus, setSubmitStatus] = React.useState("")
  const [submitted, setSubmitted] = React.useState(false)
  const [userOpHashResult, setUserOpHashResult] = React.useState("")
  const [showJson, setShowJson] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Read Pimlico key from env, allow override
  const envPimlicoKey = process.env.NEXT_PUBLIC_PIMLICO_API_KEY ?? ''
  const [pimlicoKey, setPimlicoKey] = React.useState(wizard.pimlicoApiKey || envPimlicoKey)

  const leaves = wizard.leaves
  const accountAddr = wizard.deployedAddresses?.hcaAccount ?? ''

  React.useEffect(() => {
    const firstAvailable = leaves.find(l => !l.used)?.index ?? null
    setSelectedLeafIndex(firstAvailable)
  }, [leaves])

  const handleSign = async () => {
    if (selectedLeafIndex === null || !wizard.masterSeed || !wizard.leafRoots) return
    setError(null)
    setIsSigning(true)
    setSignStatus('Building UserOperation...')

    try {
      const leaf = leaves[selectedLeafIndex]
      if (!leaf) {
        setError(`Leaf ${selectedLeafIndex} not found.`)
        setIsSigning(false)
        return
      }

      const version = SCHEME_VERSIONS[leaf.scheme]

      // Build the callData: account.execute(to, value, "0x")
      const callData = encodeFunctionData({
        abi: hcaAccountAbi,
        functionName: 'execute',
        args: [toAddress as `0x${string}`, parseEther(amount), '0x'],
      })

      // Read on-chain nonce
      const onChainNonce = publicClient
        ? await publicClient.readContract({
            address: accountAddr as `0x${string}`,
            abi: hcaAccountAbi,
            functionName: 'nonce',
          })
        : BigInt(0)

      // Get Pimlico's recommended gas price — using their values avoids rejections
      // for "maxFeePerGas too low" and matches what Pimlico uses in simulation.
      // Skip the eth_estimateUserOperationGas step entirely — Pimlico inflates
      // verificationGasLimit during estimation to a block-gas-limit ceiling,
      // which makes the simulated prefund bigger than the real tx ever will.
      // Our Foundry tests prove Lamport < 2.4M and Falcon < 2.1M verification gas,
      // so 3M is a safe hardcoded ceiling.
      setSignStatus('Reading Pimlico gas prices...')
      let maxFee: bigint
      let maxPrio: bigint
      if (pimlicoKey) {
        try {
          const gp = await getPimlicoGasPrice(pimlicoKey, 11155111)
          maxFee = BigInt(gp.maxFeePerGas)
          maxPrio = BigInt(gp.maxPriorityFeePerGas)
        } catch {
          // Fallback to on-chain base fee if Pimlico is down
          const block = publicClient ? await publicClient.getBlock() : null
          const baseFee = block?.baseFeePerGas ?? BigInt(1_000_000_000)
          maxFee = (baseFee * BigInt(3)) / BigInt(2) + BigInt(1_000_000_000)
          maxPrio = BigInt(1_000_000_000)
        }
      } else {
        const block = publicClient ? await publicClient.getBlock() : null
        const baseFee = block?.baseFeePerGas ?? BigInt(1_000_000_000)
        maxFee = (baseFee * BigInt(3)) / BigInt(2) + BigInt(1_000_000_000)
        maxPrio = BigInt(1_000_000_000)
      }

      // Pre-flight balance check: the EntryPoint's prefund = totalGas * maxFeePerGas.
      // We use fixed gas limits, so the prefund is deterministic.
      const CALL_GAS = BigInt(500_000)
      const VERIFICATION_GAS = BigInt(3_000_000)
      const PRE_VERIFICATION_GAS = BigInt(100_000)
      const requiredPrefund = (CALL_GAS + VERIFICATION_GAS + PRE_VERIFICATION_GAS) * maxFee
      if (publicClient) {
        const accountBalance = await publicClient.getBalance({ address: accountAddr as `0x${string}` })
        if (accountBalance < requiredPrefund) {
          const needEth = Number(requiredPrefund) / 1e18
          const haveEth = Number(accountBalance) / 1e18
          setError(`Account balance too low. Have ${haveEth.toFixed(4)} ETH, need at least ${needEth.toFixed(4)} ETH (maxFee = ${(Number(maxFee) / 1e9).toFixed(2)} gwei). Go back to Fund and add more ETH.`)
          setIsSigning(false)
          setSignStatus('')
          return
        }
      }

      const dummyUserOp: UserOperationV06 = {
        sender: accountAddr as `0x${string}`,
        nonce: viemToHex(BigInt(onChainNonce as bigint)),
        initCode: '0x',
        callData: callData as `0x${string}`,
        callGasLimit: viemToHex(CALL_GAS),
        verificationGasLimit: viemToHex(VERIFICATION_GAS),
        preVerificationGas: viemToHex(PRE_VERIFICATION_GAS),
        maxFeePerGas: viemToHex(maxFee),
        maxPriorityFeePerGas: viemToHex(maxPrio),
        paymasterAndData: '0x',
        signature: '0x' as `0x${string}`,
      }

      // Compute the REAL userOpHash that the EntryPoint will pass to validateUserOp
      const userOpHash = getUserOpHash(dummyUserOp, 11155111)

      // Convert hex hash to Uint8Array for the crypto libs
      const msgHash = new Uint8Array(32)
      const hashClean = userOpHash.slice(2)
      for (let i = 0; i < 32; i++) {
        msgHash[i] = parseInt(hashClean.slice(i * 2, i * 2 + 2), 16)
      }

      let fullSig: `0x${string}`
      let proofLen = 0
      let sigBytes = 0

      setSignStatus(`Signing with ${leaf.scheme} (leaf ${selectedLeafIndex})...`)

      if (leaf.scheme === 'Lamport') {
        const result = await new Promise<ReturnType<typeof lamportSign>>((resolve) => {
          setTimeout(() => {
            resolve(lamportSign(wizard.masterSeed!, selectedLeafIndex, wizard.leafRoots!.length, msgHash))
          }, 0)
        })

        const pubKeyHashesHex = bytes32ArrayToHex(result.publicKeyHashes)
        const lamportSigHex = bytes32ArrayToHex(result.signature)
        // Use HCA leaf hashes for the Merkle proof (matches authRoot with version-prefixed leaves)
        const merkleProofHex = bytes32ArrayToHex(
          wizard.leafHashes ? buildHCAMerkleProof(wizard.leafHashes, selectedLeafIndex) : result.merkleProof
        )
        proofLen = merkleProofHex.length

        const commitment = encodeAbiParameters(
          parseAbiParameters('bytes32[512]'),
          [pubKeyHashesHex as readonly `0x${string}`[]],
        )

        const sigData = encodeAbiParameters(
          parseAbiParameters('bytes32[512], bytes32[256]'),
          [pubKeyHashesHex as readonly `0x${string}`[], lamportSigHex as readonly `0x${string}`[]],
        )

        fullSig = encodeAbiParameters(
          parseAbiParameters('uint8, uint256, bytes32[], bytes, bytes'),
          [version, BigInt(selectedLeafIndex), merkleProofHex as readonly `0x${string}`[], commitment, sigData],
        ) as `0x${string}`

        sigBytes = (fullSig.length - 2) / 2

      } else if (leaf.scheme === 'Falcon') {
        // Find the stored Falcon leaf record (leafSeed + pkCompact derived at keygen time)
        const falconKey = wizard.falconKeys.find(k => k.leafIndex === selectedLeafIndex)
        if (!falconKey) {
          setError(`No Falcon record for leaf ${selectedLeafIndex}. Regenerate keys.`)
          setIsSigning(false)
          return
        }

        // Hit the Python backend to sign
        setSignStatus('Calling Falcon backend (Python)...')
        const res = await fetch('/api/falcon/sign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seed: falconKey.leafSeedHex, message: userOpHash }),
        })
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({ error: res.statusText }))
          throw new Error(`Falcon sign API failed: ${errJson.error ?? res.statusText}`)
        }
        const { pkCompact, salt, s2Compact } = await res.json() as {
          pkCompact: string[]
          salt: `0x${string}`
          s2Compact: string[]
        }

        // Sanity: the pkCompact returned at sign time must match what was committed at keygen
        if (pkCompact.join(',') !== falconKey.pkCompact.join(',')) {
          throw new Error('Falcon pkCompact mismatch — backend derived a different key than keygen')
        }

        const pkBigInts = pkCompact.map(v => BigInt(v)) as readonly bigint[]
        const s2BigInts = s2Compact.map(v => BigInt(v)) as readonly bigint[]

        // commitment = abi.encode(uint256[] pkCompact) — matches what hca-keygen.ts wrote
        const commitment = encodeAbiParameters(
          parseAbiParameters('uint256[]'),
          [pkBigInts],
        )

        // sigData = abi.encode(bytes salt, uint256[] s2, uint256[] ntth)
        const sigData = encodeAbiParameters(
          parseAbiParameters('bytes, uint256[], uint256[]'),
          [salt, s2BigInts, pkBigInts],
        )

        const merkleProofHex = bytes32ArrayToHex(
          wizard.leafHashes ? buildHCAMerkleProof(wizard.leafHashes, selectedLeafIndex) : []
        )
        proofLen = merkleProofHex.length

        fullSig = encodeAbiParameters(
          parseAbiParameters('uint8, uint256, bytes32[], bytes, bytes'),
          [version, BigInt(selectedLeafIndex), merkleProofHex as readonly `0x${string}`[], commitment, sigData],
        ) as `0x${string}`

        sigBytes = (fullSig.length - 2) / 2

      } else if (leaf.scheme === 'ECDSA') {
        // Use the connected wallet's native ECDSA signing
        if (!walletAddress) {
          setError('Connect a wallet to sign with ECDSA leaves.')
          setIsSigning(false)
          return
        }

        const walletClient = await getWalletClient(config, { chainId: 11155111 })
        const ecdsaSig = await walletClient.signMessage({ message: { raw: msgHash } })

        const merkleProofHex = bytes32ArrayToHex(
          wizard.leafHashes ? buildHCAMerkleProof(wizard.leafHashes, selectedLeafIndex) : []
        )
        proofLen = merkleProofHex.length

        // commitment = abi.encode(address signer)
        const commitment = encodeAbiParameters(parseAbiParameters('address'), [walletAddress])
        // sigData = abi.encode(address signer, bytes ecdsaSig)
        const sigData = encodeAbiParameters(parseAbiParameters('address, bytes'), [walletAddress, ecdsaSig as `0x${string}`])

        fullSig = encodeAbiParameters(
          parseAbiParameters('uint8, uint256, bytes32[], bytes, bytes'),
          [version, BigInt(selectedLeafIndex), merkleProofHex as readonly `0x${string}`[], commitment, sigData],
        ) as `0x${string}`

        sigBytes = (fullSig.length - 2) / 2

      } else {
        setError(`Unknown scheme: ${leaf.scheme}`)
        setIsSigning(false)
        return
      }

      // Store the complete UserOp with the real signature
      const finalUserOp: UserOperationV06 = { ...dummyUserOp, signature: fullSig }
      setBuiltUserOp(finalUserOp)
      setSignatureHex(fullSig)
      setSigMeta({ scheme: leaf.scheme, leafIndex: selectedLeafIndex, proofLen, sigBytes, userOpHash })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signing failed')
    } finally {
      setIsSigning(false)
      setSignStatus('')
    }
  }

  const handleSubmit = async () => {
    if (!signatureHex || !accountAddr || !builtUserOp) return
    setError(null)
    setIsSubmitting(true)
    setSubmitStatus('Checking account balance...')

    const useBundler = pimlicoKey.length > 0

    try {
      if (publicClient) {
        const balance = await publicClient.getBalance({ address: accountAddr as `0x${string}` })
        if (balance === BigInt(0)) {
          setError(`Account ${accountAddr.slice(0, 10)}... has 0 ETH. Go back to Step 4 (Fund) and send ETH to the account first.`)
          setIsSubmitting(false)
          return
        }
      }

      if (useBundler) {
        wizard.setPimlicoApiKey(pimlicoKey)

        // Skip eth_estimateUserOperationGas — Pimlico inflates verificationGasLimit
        // during estimation which balloons the simulated prefund. Our Foundry tests
        // prove the real validateUserOp fits in 3M gas for both Lamport and Falcon,
        // so we ship the UserOp with the same fixed limits we computed at sign time.
        setSubmitStatus('Sending UserOperation to bundler...')
        const opHash = await sendUserOperation(builtUserOp, pimlicoKey, 11155111)
        setUserOpHashResult(opHash)

        setSubmitStatus('Waiting for on-chain confirmation...')
        const receipt = await getUserOperationReceipt(opHash, pimlicoKey, 11155111)
        if (receipt?.transactionHash) {
          wizard.setLastTxHash(receipt.transactionHash)
        }
      } else {
        setSubmitStatus('Requesting wallet signature...')
        const walletClient = await getWalletClient(config, { chainId: 11155111 })
        if (!publicClient) {
          setError('Public client not ready.')
          setIsSubmitting(false)
          return
        }

        const hash = await walletClient.writeContract({
          address: accountAddr as `0x${string}`,
          abi: hcaAccountAbi,
          functionName: 'execute',
          args: [toAddress as `0x${string}`, parseEther(amount), '0x'],
          chain: { id: 11155111, name: 'Sepolia', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: ['https://rpc.sepolia.org'] } } },
        })

        await publicClient.waitForTransactionReceipt({ hash })
        wizard.setLastTxHash(hash)
        setUserOpHashResult(hash)
      }

      if (selectedLeafIndex !== null) {
        wizard.markLeafUsed(selectedLeafIndex)
      }
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed')
    } finally {
      setIsSubmitting(false)
      setSubmitStatus('')
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Sign & Submit Transaction</CardTitle>
          <CardDescription>Select a one-time key, sign the intent, and submit</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
           <div className="space-y-3">
             <h4 className="text-sm font-medium">1. Select Leaf Key</h4>
             <p className="text-xs text-muted">Each leaf is a one-time signing key in your Merkle tree. Green = Lamport (hash-based), Blue = Falcon (lattice-based), Orange = ECDSA (classical). Used leaves are grayed out.</p>
             <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                {leaves.map((leaf) => (
                  <button
                    key={leaf.index}
                    disabled={leaf.used}
                    onClick={() => setSelectedLeafIndex(leaf.index)}
                    className={`
                      p-2 rounded-md border text-center transition-all flex flex-col items-center gap-1
                      ${leaf.used ? 'opacity-30 cursor-not-allowed border-border bg-card' : ''}
                      ${!leaf.used && selectedLeafIndex === leaf.index ? 'border-accent bg-accent/10 shadow-[0_0_10px_rgba(88,166,255,0.2)]' : ''}
                      ${!leaf.used && selectedLeafIndex !== leaf.index ? 'border-border bg-[#161b22] hover:border-accent/50' : ''}
                    `}
                  >
                     <span className="text-xs font-mono">{leaf.index}</span>
                     <div
                        className="w-2 h-2 rounded-full"
                        style={{ background: leaf.scheme === "Lamport" ? "#238636" : leaf.scheme === "Falcon" ? "#58a6ff" : "#e3b341" }}
                     />
                  </button>
                ))}
             </div>
             <p className="text-xs text-muted">
                Selected: <span className="text-foreground">{selectedLeafIndex !== null ? `Leaf ${selectedLeafIndex} (${leaves[selectedLeafIndex]?.scheme ?? '?'})` : "None"}</span>
             </p>
           </div>

           <div className="space-y-4 pt-4 border-t border-border">
             <h4 className="text-sm font-medium">2. Transaction Details</h4>
             <p className="text-xs text-muted">Enter the recipient and amount. Clicking "Sign" builds an ERC-4337 UserOperation, computes the EntryPoint&apos;s userOpHash, and signs it with the selected PQC key — all in your browser.</p>
             <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted">To Address</label>
                  <Input value={toAddress} onChange={(e) => setToAddress(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted">Amount (ETH)</label>
                  <Input value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
             </div>

             <Button
               variant="outline"
               className="w-full"
               onClick={handleSign}
               disabled={isSigning || !!signatureHex || selectedLeafIndex === null}
             >
                {isSigning
                  ? <div className="w-4 h-4 mr-2 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  : <KeyRound className="w-4 h-4 mr-2" />
                }
                {isSigning ? "Signing..." : signatureHex ? "Signed Successfully" : "Sign with Selected Key"}
             </Button>

             {isSigning && signStatus && (
               <div className="flex items-center gap-3 p-3 border border-border rounded-lg bg-[#161b22]">
                 <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin shrink-0" />
                 <p className="text-xs text-muted">{signStatus}</p>
               </div>
             )}

             {sigMeta && signatureHex && (
               <div className="p-4 bg-[#161b22] border border-border rounded-md space-y-2">
                 <span className="text-xs text-muted uppercase block">Signature Summary</span>
                 <div className="grid grid-cols-2 gap-2 text-xs">
                   <div><span className="text-muted">Scheme:</span> <span className="text-accent font-medium">{sigMeta.scheme}</span></div>
                   <div><span className="text-muted">Version byte:</span> <span className="font-mono">0x{SCHEME_VERSIONS[sigMeta.scheme].toString(16).padStart(2, '0')}</span></div>
                   <div><span className="text-muted">Leaf index:</span> <span className="font-mono">{sigMeta.leafIndex}</span></div>
                   <div><span className="text-muted">Merkle proof:</span> <span className="font-mono">{sigMeta.proofLen} hashes</span></div>
                   <div className="col-span-2"><span className="text-muted">Total payload:</span> <span className="font-mono">{sigMeta.sigBytes.toLocaleString()} bytes</span></div>
                   <div className="col-span-2"><span className="text-muted">Signed userOpHash:</span> <span className="font-mono text-[10px] break-all">{sigMeta.userOpHash}</span></div>
                 </div>
                 <button onClick={() => setShowJson(!showJson)} className="text-xs text-accent hover:underline flex items-center gap-1 mt-1">
                   {showJson ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                   {showJson ? 'Hide raw hex' : 'Show raw hex'}
                 </button>
                 {showJson && (
                   <div className="mt-2 max-h-32 overflow-y-auto text-[10px] font-mono text-muted break-all bg-background p-2 rounded border border-border">
                     {signatureHex}
                   </div>
                 )}
               </div>
             )}
           </div>

           <div className="space-y-4 pt-4 border-t border-border">
             <h4 className="text-sm font-medium">3. Submit</h4>
             <p className="text-xs text-muted">The signed UserOperation is sent to the bundler, which wraps it in a transaction and calls the EntryPoint. The EntryPoint calls your HCA account&apos;s validateUserOp(), which verifies the PQC signature on-chain.</p>

             {pimlicoKey ? (
               <div className="p-3 border border-green-600/40 bg-green-900/10 rounded-lg flex items-start gap-3">
                 <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5 shrink-0" />
                 <div className="text-xs">
                   <p className="font-medium text-green-400">ERC-4337 Bundler Mode</p>
                   <p className="text-muted mt-0.5">
                     UserOperation → Pimlico bundler → EntryPoint → <code className="text-[10px] bg-[#161b22] px-1 rounded">validateUserOp()</code> → PQC signature verified on-chain → <code className="text-[10px] bg-[#161b22] px-1 rounded">execute()</code>
                   </p>
                 </div>
               </div>
             ) : (
               <div className="p-3 border border-yellow-600/40 bg-yellow-900/10 rounded-lg flex items-start gap-3">
                 <div className="w-2 h-2 rounded-full bg-yellow-500 mt-1.5 shrink-0" />
                 <div className="text-xs">
                   <p className="font-medium text-yellow-400">Direct Wallet Mode (no PQC verification)</p>
                   <p className="text-muted mt-0.5">
                     MetaMask signs a regular transaction calling <code className="text-[10px] bg-[#161b22] px-1 rounded">execute()</code> directly. The Lamport signature above is generated but <strong>not verified on-chain</strong>. Set <code className="text-[10px] bg-[#161b22] px-1 rounded">NEXT_PUBLIC_PIMLICO_API_KEY</code> in <code className="text-[10px] bg-[#161b22] px-1 rounded">.env.local</code> for the real ERC-4337 flow.
                   </p>
                 </div>
               </div>
             )}

             {error && (
               <p className="text-sm text-red-400">{error}</p>
             )}

             <Button
               className="w-full"
               size="lg"
               onClick={handleSubmit}
               disabled={!signatureHex || isSubmitting || submitted}
             >
                {isSubmitting
                  ? <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Server className="w-4 h-4 mr-2" />
                }
                {isSubmitting
                  ? "Submitting..."
                  : submitted
                    ? "Submitted"
                    : pimlicoKey
                      ? "Submit via Bundler (PQC verified)"
                      : "Direct Call (no PQC verification)"
                }
             </Button>

             {isSubmitting && submitStatus && (
               <div className="flex items-center gap-3 p-3 border border-border rounded-lg bg-[#161b22]">
                 <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin shrink-0" />
                 <p className="text-xs text-muted">{submitStatus}</p>
               </div>
             )}
           </div>

           {submitted && (
             <div className="p-4 bg-success/10 border border-success/30 rounded-lg space-y-2 animate-in fade-in">
                <h4 className="text-sm font-semibold text-success flex items-center gap-2">
                  <ArrowRight className="w-4 h-4" /> Transaction submitted
                </h4>
                <p className="text-xs font-mono break-all text-muted">{userOpHashResult}</p>
             </div>
           )}
        </CardContent>
      </Card>

      <div className="flex justify-between">
         <Button variant="ghost" onClick={onBack}>Back</Button>
         <Button size="lg" disabled={!submitted} onClick={onNext}>Next: Verify</Button>
      </div>
    </div>
  )
}
