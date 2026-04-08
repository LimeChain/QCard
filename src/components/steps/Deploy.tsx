import * as React from "react"
import { Button } from "../ui/Button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/Card"
import { Badge } from "../ui/Badge"
import { Wallet, CheckCircle2, ExternalLink, AlertTriangle } from "lucide-react"
import { useAccount, useConnect, useDisconnect, usePublicClient, useWalletClient } from "wagmi"
import { useWizard } from "@/lib/store"
import { hcaFactoryAbi } from "@/lib/contracts/abis"
import { ADDRESSES } from "@/lib/contracts/addresses"

export function Deploy({ onNext, onBack }: { onNext: () => void, onBack: () => void }) {
  const { address, isConnected } = useAccount()
  const { connectors, connect } = useConnect()
  const { disconnect } = useDisconnect()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const wizard = useWizard()

  const [isDeploying, setIsDeploying] = React.useState(false)
  const [isDeployed, setIsDeployed] = React.useState(false)
  const [deployError, setDeployError] = React.useState<string | null>(null)

  const factoryConfigured = (ADDRESSES.hcaFactory as string) !== ''

  const handleConnect = () => {
    connect({ connector: connectors[0] })
  }

  const handleDeploy = async () => {
    if (!walletClient || !publicClient || !address) return
    if (!wizard.authRoot) {
      setDeployError('No auth root generated. Go back to Step 2.')
      return
    }

    if (!factoryConfigured) {
      setDeployError(
        `Factory not deployed. Set ADDRESSES.hcaFactory in contracts/addresses.ts. ` +
        `Expected: a deployed HCAFactory on Sepolia.`
      )
      return
    }

    setDeployError(null)
    setIsDeploying(true)

    try {
      const salt = BigInt(Date.now())

      const hash = await walletClient.writeContract({
        address: ADDRESSES.hcaFactory,
        abi: hcaFactoryAbi,
        functionName: 'createAccount',
        args: [wizard.authRoot as `0x${string}`, address, salt],
      })

      const receipt = await publicClient.waitForTransactionReceipt({ hash })

      // Read the predicted account address
      const accountAddr = await publicClient.readContract({
        address: ADDRESSES.hcaFactory,
        abi: hcaFactoryAbi,
        functionName: 'getAccountAddress',
        args: [wizard.authRoot as `0x${string}`, address, salt],
      })

      wizard.setDeployedAddresses({
        hcaAccount: accountAddr as string,
        hcaFactory: ADDRESSES.hcaFactory,
        lamportVerifier: ADDRESSES.lamportVerifier,
        ecdsaVerifier: ADDRESSES.ecdsaVerifier,
        falconVerifier: ADDRESSES.falconVerifier,
      })

      setIsDeployed(true)
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : 'Deployment failed')
    } finally {
      setIsDeploying(false)
    }
  }

  const accountAddr = wizard.deployedAddresses?.hcaAccount
  const basescanUrl = accountAddr
    ? `https://sepolia.etherscan.io/address/${accountAddr}`
    : '#'

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>Deploy Account</CardTitle>
              <CardDescription>Deploy ERC-4337 Account & Verifiers</CardDescription>
            </div>
            <Badge variant="outline" className="flex gap-1 items-center bg-[#161b22]">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              Sepolia
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {!isConnected ? (
             <div className="flex flex-col items-center py-6 border border-dashed border-border rounded-lg bg-[#161b22] space-y-4">
                <Wallet className="w-10 h-10 text-muted" />
                <p className="text-sm text-muted">Connect your EOA wallet to deploy the abstract account.</p>
                <Button onClick={handleConnect}>Connect Wallet</Button>
             </div>
          ) : (
             <div className="flex items-center justify-between p-4 border border-border rounded-lg bg-card">
                 <div className="flex items-center gap-3">
                   <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent">
                     <Wallet className="w-4 h-4" />
                   </div>
                   <div>
                     <p className="text-sm font-medium">Connected</p>
                     <p className="text-xs text-muted font-mono">{address?.slice(0,6)}...{address?.slice(-4)}</p>
                   </div>
                 </div>
                 <Button variant="outline" size="sm" onClick={() => disconnect()}>Disconnect</Button>
             </div>
          )}

          {!factoryConfigured && (
            <div className="flex items-start gap-3 p-4 border border-yellow-600/40 bg-yellow-900/10 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-yellow-400">Contracts not deployed</p>
                <p className="text-muted mt-1">
                  Set the factory address in <code className="text-xs bg-[#161b22] px-1 py-0.5 rounded">src/lib/contracts/addresses.ts</code> after
                  deploying the HCAFactory to Sepolia.
                </p>
              </div>
            </div>
          )}

          {deployError && (
            <p className="text-sm text-red-400">{deployError}</p>
          )}

          <Button
            className="w-full"
            size="lg"
            disabled={!isConnected || isDeploying || isDeployed || !factoryConfigured}
            onClick={handleDeploy}
          >
            {isDeploying ? "Deploying..." : isDeployed ? "Deployed Successfully" : "Deploy Contracts"}
          </Button>

          {isDeployed && (
            <div className="space-y-3 animate-in fade-in pt-4 border-t border-border mt-4">
              <h4 className="text-sm font-semibold">Deployment Status</h4>
              <div className="grid grid-cols-2 gap-3">
                 <div className="p-3 border border-border rounded-lg bg-[#161b22] flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-success" />
                    <span className="text-xs text-muted">LamportVerifier</span>
                 </div>
                 <div className="p-3 border border-border rounded-lg bg-[#161b22] flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-success" />
                    <span className="text-xs text-muted">FalconVerifier</span>
                 </div>
                 <div className="p-3 border border-border rounded-lg bg-[#161b22] flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-success" />
                    <span className="text-xs text-muted">HCAFactory</span>
                 </div>
                 <div className="p-3 border border-border rounded-lg bg-accent/10 border-accent/30 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-accent" />
                    <span className="text-xs font-semibold text-accent">HCAAccount</span>
                 </div>
              </div>
              <div className="flex gap-2 text-xs mt-2 justify-end">
                <a href={basescanUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-muted hover:text-accent transition-colors">
                  View on BaseScan <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between">
         <Button variant="ghost" onClick={onBack}>Back</Button>
         <Button size="lg" disabled={!isDeployed} onClick={onNext}>Next: Fund Account</Button>
      </div>
    </div>
  )
}
