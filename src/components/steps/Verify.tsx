import * as React from "react"
import { Button } from "../ui/Button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/Card"
import { ExternalLink, CheckCircle2, ArrowRight } from "lucide-react"
import { useWizard } from "@/lib/store"
import { useReadContract } from "wagmi"
import { hcaAccountAbi, pqcAccountAbi } from "@/lib/contracts/abis"

export function Verify({
  onNext,
  onBack,
  setCurrentStep
}: {
  onNext: () => void,
  onBack: () => void,
  setCurrentStep: (step: number) => void
}) {
  const wizard = useWizard()
  const isPqcFlow = wizard.activeFlow === "pqc4337"
  const accountAddr = isPqcFlow
    ? wizard.pqc4337.deployment?.accountAddress ?? ''
    : wizard.deployedAddresses?.hcaAccount ?? ''
  const hasAccount = !!accountAddr

  const { data: hcaNonceRaw } = useReadContract({
    address: accountAddr as `0x${string}`,
    abi: hcaAccountAbi,
    functionName: 'nonce',
    query: { enabled: hasAccount && !isPqcFlow },
  })

  const { data: pqcNonceRaw } = useReadContract({
    address: accountAddr as `0x${string}`,
    abi: pqcAccountAbi,
    functionName: 'nonce',
    query: { enabled: hasAccount && isPqcFlow },
  })

  const nonceRaw = isPqcFlow ? pqcNonceRaw : hcaNonceRaw
  const nonce = nonceRaw !== undefined ? Number(nonceRaw) : 1
  const previousNonce = nonce > 0 ? nonce - 1 : 0

  const usedCount = wizard.leaves.filter(l => l.used).length
  const remaining = wizard.leafCount - usedCount

  const txHash = isPqcFlow
    ? wizard.pqc4337.lastTxHash ?? ''
    : wizard.lastTxHash ?? ''
  const basescanUrl = txHash
    ? `https://sepolia.etherscan.io/tx/${txHash}`
    : '#'

  if (isPqcFlow) {
    const keyRegistrationHash = wizard.pqc4337.registration?.txHash ?? ''
    const keyRegistrationUrl = keyRegistrationHash
      ? `https://sepolia.etherscan.io/tx/${keyRegistrationHash}`
      : '#'

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-success" />
              <div>
                <CardTitle>PQC Transaction Confirmed</CardTitle>
                <CardDescription>{wizard.pqc4337.scheme} flow completed successfully.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="p-4 border border-border bg-[#161b22] rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-muted">Key Registration Tx</span>
                  <a href={keyRegistrationUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-accent hover:underline">
                    View <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <p className="font-mono text-sm mt-2 break-all">{keyRegistrationHash || 'N/A'}</p>
              </div>
              <div className="p-4 border border-border bg-[#161b22] rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-muted">Execution Tx</span>
                  <a href={basescanUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-accent hover:underline">
                    View <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <p className="font-mono text-sm mt-2 break-all">{txHash || 'N/A'}</p>
              </div>
              <div className="p-4 border border-border bg-[#161b22] rounded-lg">
                <span className="text-sm font-medium text-muted">UserOperation Hash</span>
                <p className="font-mono text-xs mt-2 break-all">{wizard.pqc4337.lastUserOpHash || 'N/A'}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 border border-border bg-card rounded-lg flex flex-col items-center">
                <span className="text-xs text-muted uppercase tracking-wider mb-2">Account Nonce</span>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-mono text-muted line-through opacity-50">{previousNonce}</span>
                  <ArrowRight className="w-4 h-4 text-accent" />
                  <span className="text-xl font-mono text-foreground">{nonce}</span>
                </div>
              </div>
              <div className="p-4 border border-border bg-card rounded-lg flex flex-col items-center">
                <span className="text-xs text-muted uppercase tracking-wider mb-2">Scheme</span>
                <span className="text-sm font-mono text-foreground">{wizard.pqc4337.scheme}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col sm:flex-row justify-center gap-4 pt-4">
          <Button variant="outline" size="lg" onClick={() => { wizard.resetPqc4337(); setCurrentStep(0) }}>
            Start New PQC Flow
          </Button>
          <Button size="lg" onClick={() => setCurrentStep(4)}>
            Sign Another Transaction
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-6 h-6 text-success" />
            <div>
              <CardTitle>Transaction Confirmed</CardTitle>
              <CardDescription>Your quantum-resistant transaction was successful.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
           <div className="p-4 border border-border bg-[#161b22] rounded-lg">
             <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-muted">Transaction Hash</span>
                <a href={basescanUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-accent hover:underline">
                  View on Etherscan <ExternalLink className="w-3 h-3" />
                </a>
             </div>
             <p className="font-mono text-sm mt-2 break-all">{txHash || 'N/A'}</p>
           </div>

           <div className="grid grid-cols-2 gap-4">
              <div className="p-4 border border-border bg-card rounded-lg flex flex-col items-center">
                 <span className="text-xs text-muted uppercase tracking-wider mb-2">Account Nonce</span>
                 <div className="flex items-center gap-2">
                    <span className="text-xl font-mono text-muted line-through opacity-50">{previousNonce}</span>
                    <ArrowRight className="w-4 h-4 text-accent" />
                    <span className="text-xl font-mono text-foreground">{nonce}</span>
                 </div>
              </div>
              <div className="p-4 border border-border bg-card rounded-lg flex flex-col items-center">
                 <span className="text-xs text-muted uppercase tracking-wider mb-2">Current Key Index</span>
                 <div className="flex items-center gap-2">
                    <span className="text-xl font-mono text-muted line-through opacity-50">{usedCount > 0 ? usedCount - 1 : 0}</span>
                    <ArrowRight className="w-4 h-4 text-accent" />
                    <span className="text-xl font-mono text-foreground">{usedCount}</span>
                 </div>
              </div>
           </div>

           <div className="space-y-2 pt-4 border-t border-border">
              <div className="flex justify-between items-center text-sm">
                 <span className="font-medium">Remaining Leaves</span>
                 <span className="text-muted">{remaining} of {wizard.leafCount} remaining</span>
              </div>
              <div className="w-full h-2 rounded-full bg-[#161b22] overflow-hidden border border-border">
                 <div className="h-full bg-success" style={{ width: `${(remaining / wizard.leafCount) * 100}%` }}></div>
              </div>
           </div>

        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row justify-center gap-4 pt-4">
         <Button variant="outline" size="lg" onClick={() => { wizard.reset(); setCurrentStep(0) }}>
            Create New Account
         </Button>
         <Button size="lg" onClick={() => setCurrentStep(4)}>
            Sign Another Transaction
         </Button>
      </div>
    </div>
  )
}
