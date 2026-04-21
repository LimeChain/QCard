import * as React from "react"
import { Button } from "../ui/Button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/Card"
import { MerkleTreeViz } from "../MerkleTreeViz"
import { Badge } from "../ui/Badge"
import { useWizard, type LeafConfig } from "@/lib/store"

function buildLeaves(leafCount: number): LeafConfig[] {
  return Array.from({ length: leafCount }).map((_, i) => ({
    index: i,
    scheme: (i % 3 === 0 ? "Lamport" : i % 3 === 1 ? "Falcon" : "ECDSA") as LeafConfig['scheme'],
    used: false,
  }))
}

export function ConfigureAccount({ onNext }: { onNext: () => void }) {
  const wizard = useWizard()
  const [leafCount, setLeafCount] = React.useState(wizard.leafCount)
  const [pqcScheme, setPqcScheme] = React.useState(wizard.pqc4337.scheme)

  const leaves = React.useMemo(() => buildLeaves(leafCount), [leafCount])

  const schemeCounts = React.useMemo(() => {
    const counts = { Lamport: 0, Falcon: 0, ECDSA: 0 }
    for (const l of leaves) counts[l.scheme]++
    return counts
  }, [leaves])

  const handleNext = () => {
    wizard.setLeafConfig(leafCount, leaves)
    onNext()
  }

  const rootHashPreview = wizard.authRoot ?? "0x" + "0".repeat(64)

  if (wizard.activeFlow === "pqc4337") {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Configure PQC-4337 Scheme</CardTitle>
            <CardDescription>Select the scheme for your dedicated PQC account</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <label className="flex items-start gap-3 p-3 border border-border rounded-lg cursor-pointer hover:border-accent/60">
                <input
                  type="radio"
                  name="pqcScheme"
                  value="falcon-eth"
                  checked={pqcScheme === "falcon-eth"}
                  onChange={() => setPqcScheme("falcon-eth")}
                  className="accent-accent mt-1"
                />
                <div>
                  <p className="text-sm font-medium">Falcon-ETH</p>
                  <p className="text-xs text-muted mt-1">Falcon-512 ETH-variant (Keccak Hash-to-Point), with ZKNOX setKey pointer registration.</p>
                </div>
              </label>
              <label className="flex items-start gap-3 p-3 border border-border rounded-lg cursor-pointer hover:border-accent/60">
                <input
                  type="radio"
                  name="pqcScheme"
                  value="mldsa-eth"
                  checked={pqcScheme === "mldsa-eth"}
                  onChange={() => setPqcScheme("mldsa-eth")}
                  className="accent-accent mt-1"
                />
                <div>
                  <p className="text-sm font-medium">ML-DSA-ETH</p>
                  <p className="text-xs text-muted mt-1">ML-DSA-44 ETH-variant (Keccak-PRG), browser-side keygen/signing and on-chain ETHDILITHIUM verification.</p>
                </div>
              </label>
            </div>

            <div className="pt-2">
              <Badge variant="outline">Selected: {pqcScheme}</Badge>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button
            size="lg"
            onClick={() => {
              wizard.setPqc4337Scheme(pqcScheme)
              onNext()
            }}
          >
            Next: Generate Keys
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Configure Tree Leaves</CardTitle>
          <CardDescription>Select tree capacity and cryptographic schemes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
           <div>
             <label className="text-sm font-medium mb-2 block">Leaf Count (Max Transactions)</label>
             <div className="flex gap-4">
               {[4, 8, 16, 32].map((num) => (
                 <label key={num} className="flex items-center gap-2 cursor-pointer">
                   <input
                     type="radio"
                     name="leafCount"
                     value={num}
                     checked={leafCount === num}
                     onChange={() => setLeafCount(num)}
                     className="accent-accent"
                   />
                   <span>{num}</span>
                 </label>
               ))}
             </div>
           </div>

           <div className="pt-4 border-t border-border mt-4">
             <h4 className="text-sm font-medium mb-2">Selected Leaves Schema</h4>
             <div className="flex flex-wrap gap-2">
               <Badge variant="outline">Lamport: {schemeCounts.Lamport}</Badge>
               <Badge variant="outline">Falcon: {schemeCounts.Falcon}</Badge>
               <Badge variant="outline">ECDSA: {schemeCounts.ECDSA}</Badge>
             </div>
           </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
           <CardTitle>Merkle Tree Preview</CardTitle>
        </CardHeader>
        <CardContent>
           <MerkleTreeViz leaves={leaves} rootHash={rootHashPreview} />
        </CardContent>
      </Card>

      <div className="flex justify-end">
         <Button size="lg" onClick={handleNext}>Next: Generate Keys</Button>
      </div>
    </div>
  )
}
