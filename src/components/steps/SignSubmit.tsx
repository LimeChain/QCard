import * as React from "react"
import { Button } from "../ui/Button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/Card"
import { Input } from "../ui/Input"
import { CodeBlock } from "../ui/CodeBlock"
import { Badge } from "../ui/Badge"
import { ArrowRight, KeyRound, Server, ChevronDown, ChevronUp } from "lucide-react"
import { useWizard } from "@/lib/store"
import { useAccount, usePublicClient, useWalletClient } from "wagmi"
import { encodeFunctionData, encodeAbiParameters, parseAbiParameters, parseEther, toHex as viemToHex } from "viem"
import { signMessage as lamportSign, generateLeafKeypair, buildMerkleProof } from "@/lib/crypto"
import { keccak256 } from "@/lib/crypto"
import { hcaAccountAbi } from "@/lib/contracts/abis"
import { sendUserOperation, getUserOperationReceipt, type UserOperationV06 } from "@/lib/bundler/pimlico"

function bytesToHex(bytes: Uint8Array): `0x${string}` {
  return ('0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`
}

function bytes32ArrayToHex(arr: Uint8Array[]): `0x${string}`[] {
  return arr.map(bytesToHex)
}

const VERSION_LAMPORT = 0x01

export function SignSubmit({ onNext, onBack }: { onNext: () => void, onBack: () => void }) {
  const wizard = useWizard()
  const { address: walletAddress } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const [selectedLeafIndex, setSelectedLeafIndex] = React.useState<number | null>(null)
  const [toAddress, setToAddress] = React.useState("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")
  const [amount, setAmount] = React.useState("0.001")
  const [isSigning, setIsSigning] = React.useState(false)
  const [signatureHex, setSignatureHex] = React.useState("")
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [submitted, setSubmitted] = React.useState(false)
  const [userOpHashResult, setUserOpHashResult] = React.useState("")
  const [pimlicoKey, setPimlicoKey] = React.useState(wizard.pimlicoApiKey)
  const [showJson, setShowJson] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

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

    try {
      const leaf = leaves[selectedLeafIndex]
      if (!leaf || leaf.scheme !== 'Lamport') {
        setError(`Only Lamport signing is implemented. Leaf ${selectedLeafIndex} uses ${leaf?.scheme}.`)
        setIsSigning(false)
        return
      }

      // Build the callData: account.execute(to, value, "0x")
      const callData = encodeFunctionData({
        abi: hcaAccountAbi,
        functionName: 'execute',
        args: [toAddress as `0x${string}`, parseEther(amount), '0x'],
      })

      // For PoC, hash a deterministic message as the userOpHash stand-in.
      // In production this would come from the EntryPoint's getUserOpHash.
      const msgHashInput = new TextEncoder().encode(
        `${accountAddr}:${wizard.authRoot}:${selectedLeafIndex}:${callData}`
      )
      const msgHash = keccak256(msgHashInput)

      // Run Lamport signing (CPU-intensive)
      const result = await new Promise<ReturnType<typeof lamportSign>>((resolve) => {
        setTimeout(() => {
          resolve(lamportSign(wizard.masterSeed!, selectedLeafIndex, wizard.leafRoots!.length, msgHash))
        }, 0)
      })

      // Build the 5-field signature matching the contract:
      // abi.encode(uint8 version, uint256 leafIndex, bytes32[] merkleProof, bytes commitment, bytes sigData)
      //
      // commitment = abi.encode(bytes32[512] pubKeyHashes)
      // sigData    = abi.encode(bytes32[512] pubKeyHashes, bytes32[256] lamportSig)

      const pubKeyHashesHex = bytes32ArrayToHex(result.publicKeyHashes)
      const lamportSigHex = bytes32ArrayToHex(result.signature)
      const merkleProofHex = bytes32ArrayToHex(result.merkleProof)

      // commitment: abi.encode(bytes32[512])
      const commitment = encodeAbiParameters(
        parseAbiParameters('bytes32[512]'),
        [pubKeyHashesHex as readonly `0x${string}`[]],
      )

      // sigData: abi.encode(bytes32[512], bytes32[256])
      const sigData = encodeAbiParameters(
        parseAbiParameters('bytes32[512], bytes32[256]'),
        [
          pubKeyHashesHex as readonly `0x${string}`[],
          lamportSigHex as readonly `0x${string}`[],
        ],
      )

      // Full signature: abi.encode(uint8, uint256, bytes32[], bytes, bytes)
      const fullSig = encodeAbiParameters(
        parseAbiParameters('uint8, uint256, bytes32[], bytes, bytes'),
        [VERSION_LAMPORT, BigInt(selectedLeafIndex), merkleProofHex as readonly `0x${string}`[], commitment, sigData],
      )

      setSignatureHex(fullSig)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signing failed')
    } finally {
      setIsSigning(false)
    }
  }

  const handleSubmit = async () => {
    if (!signatureHex || !accountAddr) return
    setError(null)
    setIsSubmitting(true)

    const useBundler = pimlicoKey.length > 0

    try {
      if (useBundler) {
        wizard.setPimlicoApiKey(pimlicoKey)

        const callData = encodeFunctionData({
          abi: hcaAccountAbi,
          functionName: 'execute',
          args: [toAddress as `0x${string}`, parseEther(amount), '0x'],
        })

        const userOp: UserOperationV06 = {
          sender: accountAddr as `0x${string}`,
          nonce: '0x0',
          initCode: '0x',
          callData: callData as `0x${string}`,
          callGasLimit: viemToHex(BigInt(500_000)),
          verificationGasLimit: viemToHex(BigInt(3_500_000)),
          preVerificationGas: viemToHex(BigInt(100_000)),
          maxFeePerGas: '0x0',
          maxPriorityFeePerGas: '0x0',
          paymasterAndData: '0x',
          signature: signatureHex as `0x${string}`,
        }

        const opHash = await sendUserOperation(userOp, pimlicoKey, 11155111)
        setUserOpHashResult(opHash)

        const receipt = await getUserOperationReceipt(opHash, pimlicoKey, 11155111)
        if (receipt?.transactionHash) {
          wizard.setLastTxHash(receipt.transactionHash)
        }
      } else {
        // Fallback: direct call via connected wallet
        if (!walletClient || !publicClient) {
          setError('Connect a wallet or provide a Pimlico API key.')
          setIsSubmitting(false)
          return
        }

        const hash = await walletClient.writeContract({
          address: accountAddr as `0x${string}`,
          abi: hcaAccountAbi,
          functionName: 'execute',
          args: [toAddress as `0x${string}`, parseEther(amount), '0x'],
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
    }
  }

  const userOpJson = JSON.stringify({
    sender: accountAddr,
    nonce: "0",
    initCode: "0x",
    callData: "0x...",
    callGasLimit: "500000",
    verificationGasLimit: "3500000",
    preVerificationGas: "100000",
    maxFeePerGas: "0",
    maxPriorityFeePerGas: "0",
    paymasterAndData: "0x",
    signature: signatureHex ? signatureHex.slice(0, 66) + "..." : "0x..."
  }, null, 2)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Sign & Submit Transaction</CardTitle>
          <CardDescription>Select a one-time key, sign the intent, and submit via Paymaster</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
           <div className="space-y-3">
             <h4 className="text-sm font-medium">1. Select Leaf Key (One-Time-Pad)</h4>
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
                <KeyRound className="w-4 h-4 mr-2" />
                {isSigning ? "Signing locally..." : signatureHex ? "Signed Successfully" : "Sign with Selected Key"}
             </Button>

             {signatureHex && (
               <div className="p-3 bg-[#161b22] border border-border rounded-md break-all">
                 <span className="text-xs text-muted uppercase block mb-1">Signature Payload</span>
                 <span className="text-xs font-mono text-accent">{signatureHex.slice(0, 100)}...</span>
               </div>
             )}
           </div>

           <div className="space-y-4 pt-4 border-t border-border">
             <h4 className="text-sm font-medium">3. Bundler / Paymaster (Pimlico)</h4>
             <div className="space-y-1">
               <label className="text-xs text-muted">Pimlico API Key (optional -- leave empty for direct call)</label>
               <Input
                 type="password"
                 placeholder="pk_test_..."
                 value={pimlicoKey}
                 onChange={(e) => setPimlicoKey(e.target.value)}
               />
             </div>

             {error && (
               <p className="text-sm text-red-400">{error}</p>
             )}

             <Button
               className="w-full"
               size="lg"
               onClick={handleSubmit}
               disabled={!signatureHex || isSubmitting || submitted}
             >
                <Server className="w-4 h-4 mr-2" />
                {isSubmitting
                  ? "Submitting..."
                  : submitted
                    ? "Submitted"
                    : pimlicoKey
                      ? "Submit via Bundler"
                      : "Direct Call via Wallet"
                }
             </Button>
           </div>

           {submitted && (
              <div className="animate-in fade-in p-4 border border-success/30 bg-success/10 rounded-lg text-center space-y-2">
                 <Badge variant="success" className="mb-2">{pimlicoKey ? "UserOp Submitted" : "Transaction Sent"}</Badge>
                 <p className="text-sm font-mono text-muted break-all">Hash: {userOpHashResult}</p>
              </div>
           )}

           <div className="pt-2">
             <button
               className="flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors"
               onClick={() => setShowJson(!showJson)}
             >
               {showJson ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
               View Raw UserOperation
             </button>
             {showJson && (
               <div className="mt-2 animate-in slide-in-from-top-2">
                 <CodeBlock code={userOpJson} />
               </div>
             )}
           </div>
        </CardContent>
      </Card>

      <div className="flex justify-between">
         <Button variant="ghost" onClick={onBack}>Back</Button>
         <Button size="lg" disabled={!submitted} onClick={onNext}>Next: Verify Result</Button>
      </div>
    </div>
  )
}
