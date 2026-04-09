import * as React from "react"
import { Button } from "../ui/Button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "../ui/Card"
import { Input } from "../ui/Input"
import { Lock, Download, Key } from "lucide-react"
import { useWizard, type FalconLeafKey } from "@/lib/store"
import { useAccount } from "wagmi"
import {
  generateMasterSeed,
  encryptSeed,
  downloadSeedFile,
} from "@/lib/crypto"
import { generateHCALeaves, buildHCAAccountRoot } from "@/lib/crypto/hca-keygen"

function toHex(bytes: Uint8Array): string {
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

function maskHex(hex: string): string {
  if (hex.length < 12) return hex
  return hex.slice(0, 6) + '...' + hex.slice(-4)
}

export function GenerateKeys({ onNext, onBack }: { onNext: () => void, onBack: () => void }) {
  const wizard = useWizard()
  const { address: walletAddress } = useAccount()
  const [password, setPassword] = React.useState("")
  const [isGenerating, setIsGenerating] = React.useState(false)
  const [progress, setProgress] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)

  // Derive "complete" from persisted wizard state — survives refresh
  const complete = !!(wizard.masterSeed && wizard.authRoot)

  const leafCount = wizard.leafCount || 16

  const handleGenerate = async () => {
    if (!password) {
      setError("Please enter an encryption password.")
      return
    }
    setError(null)
    setIsGenerating(true)
    setProgress(0)

    try {
      // Check if ECDSA leaves need a wallet
      const hasEcdsaLeaves = wizard.leaves.some(l => l.scheme === 'ECDSA')
      if (hasEcdsaLeaves && !walletAddress) {
        setError('ECDSA leaves require a connected wallet. Connect your wallet first (it will be used in the Deploy step), then generate keys.')
        return
      }

      // Step 1: Generate master seed (fast)
      setProgress(10)
      const masterSeed = generateMasterSeed()

      // Step 2: Generate multi-scheme leaf data
      // Falcon leaves hit /api/falcon/keygen, so this is async and may take a few seconds per leaf
      setProgress(20)

      const ecdsaAddr = walletAddress ?? undefined
      const leafData = await generateHCALeaves(masterSeed, wizard.leaves, ecdsaAddr)

      setProgress(50)

      // Build account Merkle tree from leaf hashes
      const { leafHashes, accountRoot } = buildHCAAccountRoot(leafData)

      // Also compute legacy leafRoots for Lamport leaves (needed for Lamport signing)
      const leafRoots = leafData.map(l => l.leafHash)

      setProgress(70)

      // Step 3: Encrypt seed
      const encrypted = await encryptSeed(masterSeed, password)

      setProgress(90)

      const authRootHex = toHex(accountRoot)

      // Falcon leaves: store the derived seed + pkCompact so signing can rebuild the exact same key
      const falconKeys: FalconLeafKey[] = leafData
        .filter(l => l.scheme === 'Falcon' && l.falconPkCompact && l.falconLeafSeedHex)
        .map(l => ({
          leafIndex: l.index,
          leafSeedHex: l.falconLeafSeedHex!,
          pkCompact: l.falconPkCompact!,
        }))

      // Store everything in wizard context
      wizard.setKeygenResult({
        masterSeed,
        encryptedSeed: encrypted,
        authRoot: authRootHex,
        leafRoots,
        leafHashes,
        falconKeys,
        ecdsaAddress: walletAddress ?? null,
      })

      setProgress(100)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Key generation failed')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleDownload = () => {
    if (wizard.encryptedSeed) {
      downloadSeedFile(wizard.encryptedSeed, 'pqc-seed.json')
    }
  }

  const maskedSeed = wizard.masterSeed ? maskHex(toHex(wizard.masterSeed)) : '---'
  const authRoot = wizard.authRoot ?? '---'

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Generate Keypair</CardTitle>
          <CardDescription>Generate master seed and derive tree leaves</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!complete && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Encryption Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
                  <Input
                    type="password"
                    placeholder="Enter a secure password..."
                    className="pl-9"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-400">{error}</p>
              )}

              <Button className="w-full" onClick={handleGenerate} disabled={isGenerating}>
                {isGenerating ? "Generating..." : "Generate & Encrypt Seed"}
              </Button>

              {isGenerating && (
                <div className="w-full h-2 bg-card rounded-full overflow-hidden border border-border">
                  <div className="h-full bg-accent transition-all duration-100" style={{ width: `${progress}%` }}></div>
                </div>
              )}
            </div>
          )}

          {complete && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
               <div className="grid gap-2 text-sm border border-border p-4 rounded-lg bg-[#161b22]">
                 <div className="flex justify-between">
                   <span className="text-muted text-xs uppercase tracking-wider">Masked Seed</span>
                   <span className="font-mono text-accent">{maskedSeed}</span>
                 </div>
                 <div className="flex justify-between">
                   <span className="text-muted text-xs uppercase tracking-wider">Auth Root</span>
                   <span className="font-mono text-muted group-hover:text-foreground transition-colors truncate max-w-[200px] sm:max-w-xs">{authRoot}</span>
                 </div>
                 <div className="flex justify-between">
                   <span className="text-muted text-xs uppercase tracking-wider">Leaf Count</span>
                   <span>{leafCount}</span>
                 </div>
               </div>

               <div className="flex flex-col gap-2">
                 <Button variant="outline" className="w-full flex gap-2" onClick={handleDownload}>
                   <Download className="w-4 h-4" /> Download Encrypted Seed
                 </Button>
                 <p className="text-xs text-muted text-center">Save this seed securely. It is needed for signing transactions.</p>
               </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between">
         <Button variant="ghost" onClick={onBack}>Back</Button>
         <Button size="lg" disabled={!complete} onClick={onNext}>Next: Deploy</Button>
      </div>
    </div>
  )
}
