import * as React from "react"
import { Button } from "../ui/Button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/Card"
import { Badge } from "../ui/Badge"
import { Wallet, CheckCircle2, ExternalLink, AlertTriangle } from "lucide-react"
import { useAccount, useConnect, useDisconnect, usePublicClient, useSwitchChain } from "wagmi"
import { getWalletClient } from "wagmi/actions"
import { sepolia } from "wagmi/chains"
import { decodeEventLog } from "viem"
import { config } from "@/lib/wagmi"
import { useWizard } from "@/lib/store"
import { hcaFactoryAbi, pqc4337FactoryAbi } from "@/lib/contracts/abis"
import { ADDRESSES } from "@/lib/contracts/addresses"

export function Deploy({ onNext, onBack }: { onNext: () => void, onBack: () => void }) {
  const { address, isConnected, chainId } = useAccount()
  const { connectors, connect } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain } = useSwitchChain()
  const publicClient = usePublicClient()
  const wizard = useWizard()

  const [isDeploying, setIsDeploying] = React.useState(false)
  const [deployStatus, setDeployStatus] = React.useState("")
  const [deployError, setDeployError] = React.useState<string | null>(null)
  const isPqcFlow = wizard.activeFlow === "pqc4337"

  const selectedPqcVerifier = wizard.pqc4337.scheme === "falcon-eth"
    ? ADDRESSES.falconEthVerifier
    : ADDRESSES.mldsaEthVerifier

  const deploymentMatchesConfig = wizard.deployedAddresses
    ? wizard.deployedAddresses.hcaFactory.toLowerCase() === ADDRESSES.hcaFactory.toLowerCase()
      && wizard.deployedAddresses.lamportVerifier.toLowerCase() === ADDRESSES.lamportVerifier.toLowerCase()
      && wizard.deployedAddresses.ecdsaVerifier.toLowerCase() === ADDRESSES.ecdsaVerifier.toLowerCase()
      && wizard.deployedAddresses.falconVerifier.toLowerCase() === ADDRESSES.falconVerifier.toLowerCase()
    : false

  const pqcDeploymentMatchesConfig = wizard.pqc4337.deployment
    ? wizard.pqc4337.deployment.factoryAddress.toLowerCase() === ADDRESSES.pqc4337Factory.toLowerCase()
      && wizard.pqc4337.deployment.verifierAddress.toLowerCase() === selectedPqcVerifier.toLowerCase()
      && wizard.pqc4337.deployment.entryPointAddress.toLowerCase() === ADDRESSES.entryPointV07.toLowerCase()
    : false

  // Derive from persisted wizard state — survives refresh, but invalidate stale deployments
  // if the configured contract addresses changed since the last deploy.
  const isDeployed = !!wizard.deployedAddresses && deploymentMatchesConfig
  const isPqcDeployed = !!wizard.pqc4337.deployment && pqcDeploymentMatchesConfig

  const factoryConfigured = (ADDRESSES.hcaFactory as string) !== ''
  const pqcFactoryConfigured = (ADDRESSES.pqc4337Factory as string) !== '' && (selectedPqcVerifier as string) !== ''
  const wrongChain = isConnected && chainId !== sepolia.id

  const handleConnect = () => {
    connect({ connector: connectors[0] })
  }

  const handleDeploy = async () => {
    if (!publicClient || !address) {
      setDeployError('Wallet not connected.')
      return
    }

    if (isPqcFlow) {
      if (!wizard.pqc4337.keypair) {
        setDeployError("No PQC keypair found. Go back to Step 2 and generate keys first.")
        return
      }
      if (!pqcFactoryConfigured) {
        setDeployError("PQC factory/verifier not configured. Set NEXT_PUBLIC_PQC4337_FACTORY and the scheme verifier address in .env.local.")
        return
      }

      setDeployError(null)
      setIsDeploying(true)
      try {
        const walletClient = await getWalletClient(config, { chainId: 11155111 })

        const salt = BigInt(Date.now())
        setDeployStatus("Registering key + deploying account atomically...")
        const createHash = wizard.pqc4337.scheme === "falcon-eth"
          ? await walletClient.writeContract({
            address: ADDRESSES.pqc4337Factory,
            abi: pqc4337FactoryAbi,
            functionName: "createFalconAccountWithKey",
            args: [address, wizard.pqc4337.keypair.encodedPublicKey, salt],
          })
          : await walletClient.writeContract({
            address: ADDRESSES.pqc4337Factory,
            abi: pqc4337FactoryAbi,
            functionName: "createMlDsaEthAccountWithKey",
            args: [address, wizard.pqc4337.keypair.encodedPublicKey, salt],
          })

        const createReceipt = await publicClient.waitForTransactionReceipt({
          hash: createHash,
          timeout: 120_000,
          pollingInterval: 3_000,
        })

        let accountAddr: `0x${string}` | null = null
        let pointer: `0x${string}` | null = null
        for (const log of createReceipt.logs) {
          if (log.address.toLowerCase() !== ADDRESSES.pqc4337Factory.toLowerCase()) continue
          try {
            const decoded = decodeEventLog({
              abi: pqc4337FactoryAbi,
              data: log.data,
              topics: log.topics,
            })
            if (decoded.eventName !== "FalconEthAccountCreated" && decoded.eventName !== "MlDsaEthAccountCreated") {
              continue
            }
            accountAddr = decoded.args.account as `0x${string}`
            pointer = decoded.args.publicKeyPointer as `0x${string}`
            break
          } catch {
            // ignore non-factory logs/events
          }
        }

        if (!accountAddr || !pointer) {
          throw new Error("Could not parse deployed account/public key pointer from factory events.")
        }

        wizard.setPqc4337Registration({
          verifierAddress: selectedPqcVerifier,
          publicKeyPointer: pointer,
          txHash: createHash,
        })
        wizard.setPqc4337Deployment({
          scheme: wizard.pqc4337.scheme,
          accountAddress: accountAddr,
          factoryAddress: ADDRESSES.pqc4337Factory,
          verifierAddress: selectedPqcVerifier,
          entryPointAddress: ADDRESSES.entryPointV07,
          publicKeyPointer: pointer,
          ownerAddress: address,
          salt: salt.toString(),
        })
        wizard.setPqc4337LastTxHash(createHash)
      } catch (err) {
        const msg = err instanceof Error ? err.message : "PQC deployment failed"
        setDeployError(msg)
      } finally {
        setIsDeploying(false)
        setDeployStatus("")
      }
      return
    }

    if (!wizard.authRoot) {
      setDeployError('No auth root generated. Go back to Step 2.')
      return
    }

    if (!factoryConfigured) {
      setDeployError(
        `Factory not deployed. Set NEXT_PUBLIC_HCA_FACTORY in .env.local.`
      )
      return
    }

    setDeployError(null)
    setIsDeploying(true)

    try {
      setDeployStatus('Requesting wallet signature...')
      const walletClient = await getWalletClient(config, { chainId: 11155111 })

      const salt = BigInt(Date.now())

      const hash = await walletClient.writeContract({
        address: ADDRESSES.hcaFactory,
        abi: hcaFactoryAbi,
        functionName: 'createAccount',
        args: [wizard.authRoot as `0x${string}`, address, salt],
      })

      setDeployStatus(`Transaction sent. Waiting for confirmation...\n${hash.slice(0, 18)}...`)
      await publicClient.waitForTransactionReceipt({
        hash,
        timeout: 120_000,
        pollingInterval: 3_000,
      })

      setDeployStatus('Reading deployed account address...')
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Deployment failed'
      if (msg.includes('could not be found')) {
        setDeployError('Transaction submitted but receipt timed out. Sepolia may be congested. Check Etherscan and retry in a minute.')
      } else {
        setDeployError(msg)
      }
    } finally {
      setIsDeploying(false)
      setDeployStatus('')
    }
  }

  const accountAddr = wizard.deployedAddresses?.hcaAccount
  const basescanUrl = accountAddr
    ? `https://sepolia.etherscan.io/address/${accountAddr}`
    : '#'

  const pqcAccountAddr = wizard.pqc4337.deployment?.accountAddress
  const pqcBasescanUrl = pqcAccountAddr
    ? `https://sepolia.etherscan.io/address/${pqcAccountAddr}`
    : "#"

  if (isPqcFlow) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle>Deploy PQC-4337 Account</CardTitle>
                <CardDescription>Register public key and deploy {wizard.pqc4337.scheme} account</CardDescription>
              </div>
              <Badge variant="outline" className="flex gap-1 items-center bg-[#161b22]">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                Sepolia
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {!isConnected ? (
              <div className="flex flex-col items-center py-6 border border-dashed border-border rounded-lg bg-[#161b22] space-y-4">
                <Wallet className="w-10 h-10 text-muted" />
                <p className="text-sm text-muted">Connect your wallet to register the key and deploy the account.</p>
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
                    <p className="text-xs text-muted font-mono">{address?.slice(0, 6)}...{address?.slice(-4)}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => { disconnect(); setDeployError(null) }}>Disconnect</Button>
              </div>
            )}

            {wrongChain && (
              <div className="flex items-center justify-between p-4 border border-yellow-600/40 bg-yellow-900/10 rounded-lg">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-yellow-400">Wrong network</p>
                    <p className="text-muted">Connected to chain {chainId}. Switch to Sepolia.</p>
                  </div>
                </div>
                <Button size="sm" onClick={() => switchChain({ chainId: sepolia.id })}>Switch</Button>
              </div>
            )}

            {!pqcFactoryConfigured && (
              <div className="flex items-start gap-3 p-4 border border-yellow-600/40 bg-yellow-900/10 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-yellow-400">PQC contracts not configured</p>
                  <p className="text-muted mt-1">
                    Set <code className="text-xs bg-[#161b22] px-1 py-0.5 rounded">NEXT_PUBLIC_PQC4337_FACTORY</code> and the selected scheme verifier address in <code className="text-xs bg-[#161b22] px-1 py-0.5 rounded">.env.local</code>.
                  </p>
                </div>
              </div>
            )}

            {deployError && (
              <p className="text-sm text-red-400">{deployError}</p>
            )}

            {wizard.pqc4337.deployment && !pqcDeploymentMatchesConfig && (
              <div className="flex items-start gap-3 p-4 border border-yellow-600/40 bg-yellow-900/10 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-yellow-400">Stored PQC deployment is stale</p>
                  <p className="text-muted mt-1">Configured factory, verifier, or EntryPoint changed. Deploy a fresh PQC account.</p>
                </div>
              </div>
            )}

            <Button
              className="w-full"
              size="lg"
              disabled={!isConnected || isDeploying || isPqcDeployed || !pqcFactoryConfigured || wrongChain}
              onClick={handleDeploy}
            >
              {isDeploying ? "Deploying..." : isPqcDeployed ? "Deployed Successfully" : "Register Key + Deploy"}
            </Button>

            {isDeploying && deployStatus && (
              <div className="flex items-center gap-3 p-3 border border-border rounded-lg bg-[#161b22]">
                <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin shrink-0" />
                <p className="text-xs text-muted">{deployStatus}</p>
              </div>
            )}

            {isPqcDeployed && (
              <div className="space-y-3 animate-in fade-in pt-4 border-t border-border mt-4">
                <h4 className="text-sm font-semibold">Deployment Status</h4>
                <div className="grid grid-cols-1 gap-3">
                  <div className="p-3 border border-border rounded-lg bg-[#161b22] flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-success" />
                    <span className="text-xs text-muted">Verifier key registered atomically</span>
                  </div>
                  <div className="p-3 border border-border rounded-lg bg-accent/10 border-accent/30 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-accent" />
                    <span className="text-xs font-semibold text-accent">{wizard.pqc4337.scheme} account deployed</span>
                  </div>
                </div>
                <div className="flex gap-2 text-xs mt-2 justify-end">
                  <a href={pqcBasescanUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-muted hover:text-accent transition-colors">
                    View on Etherscan <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-between">
          <Button variant="ghost" onClick={onBack}>Back</Button>
          <Button size="lg" disabled={!isPqcDeployed} onClick={onNext}>Next: Fund Account</Button>
        </div>
      </div>
    )
  }

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
                 <Button variant="outline" size="sm" onClick={() => { disconnect(); setDeployError(null) }}>Disconnect</Button>
             </div>
          )}

          {wrongChain && (
            <div className="flex items-center justify-between p-4 border border-yellow-600/40 bg-yellow-900/10 rounded-lg">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-yellow-400">Wrong network</p>
                  <p className="text-muted">Connected to chain {chainId}. Switch to Sepolia.</p>
                </div>
              </div>
              <Button size="sm" onClick={() => switchChain({ chainId: sepolia.id })}>
                Switch
              </Button>
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

          {wizard.deployedAddresses && !deploymentMatchesConfig && (
            <div className="flex items-start gap-3 p-4 border border-yellow-600/40 bg-yellow-900/10 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-yellow-400">Stored deployment is stale</p>
                <p className="text-muted mt-1">
                  The contract addresses in <code className="text-xs bg-[#161b22] px-1 py-0.5 rounded">.env.local</code> changed since this account
                  was deployed. Deploy a fresh HCA account against the current verifier stack before signing.
                </p>
              </div>
            </div>
          )}

          <Button
            className="w-full"
            size="lg"
            disabled={!isConnected || isDeploying || isDeployed || !factoryConfigured || wrongChain}
            onClick={handleDeploy}
          >
            {isDeploying ? "Deploying..." : isDeployed ? "Deployed Successfully" : "Deploy Contracts"}
          </Button>

          {isDeploying && deployStatus && (
            <div className="flex items-center gap-3 p-3 border border-border rounded-lg bg-[#161b22]">
              <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin shrink-0" />
              <p className="text-xs text-muted">{deployStatus}</p>
            </div>
          )}

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
                  View on Etherscan <ExternalLink className="w-3 h-3" />
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
