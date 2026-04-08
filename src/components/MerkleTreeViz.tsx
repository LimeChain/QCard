import * as React from "react"
import { motion } from "framer-motion"

export interface MerkleTreeVizProps {
  leaves: { index: number; scheme: string; used: boolean }[]
  rootHash: string
}

export function MerkleTreeViz({ leaves, rootHash }: MerkleTreeVizProps) {
  // A simplistic visualizer: root at top, connecting to leaves at bottom 
  // (In a real tree, there would be intermediate nodes, but for phase 1
  // we'll visualize the root branching out directly or semi-directly to leaves for simplicity)
  
  const getSchemeColor = (scheme: string) => {
    switch(scheme) {
      case "Lamport": return "#238636" // green
      case "Falcon": return "#58a6ff" // blue
      case "ECDSA": return "#e3b341" // orange
      default: return "#8b949e"
    }
  }

  const w = 600
  const h = 300
  const rootX = w / 2
  const rootY = 40

  const leafY = 240
  const leafCount = leaves.length
  const leafSpacing = w / (leafCount || 1)

  return (
    <div className="w-full flex flex-col items-center justify-center p-4">
      <div className="text-center mb-2 font-mono text-sm text-muted">
        authRoot: {rootHash.slice(0,10)}...{rootHash.slice(-8)}
      </div>
      <div className="relative overflow-x-auto w-full flex justify-center">
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="max-w-full">
          {leaves.map((leaf, i) => {
            const lx = leafSpacing * i + leafSpacing / 2
            return (
              <motion.line
                key={`line-${i}`}
                x1={rootX}
                y1={rootY}
                x2={lx}
                y2={leafY}
                stroke="#30363d"
                strokeWidth="2"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.5, delay: i * 0.05 }}
              />
            )
          })}
          
          <motion.circle
            cx={rootX}
            cy={rootY}
            r="20"
            fill="#161b22"
            stroke="#58a6ff"
            strokeWidth="3"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
          />

          {leaves.map((leaf, i) => {
            const lx = leafSpacing * i + leafSpacing / 2
            const color = getSchemeColor(leaf.scheme)
            return (
              <motion.g 
                key={`leaf-${i}`}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.2 + i * 0.05 }}
              >
                <circle
                  cx={lx}
                  cy={leafY}
                  r="12"
                  fill={color}
                  opacity={leaf.used ? 0.3 : 1}
                />
                <text 
                  x={lx} 
                  y={leafY + 30} 
                  fontSize="10" 
                  fill="#c9d1d9" 
                  textAnchor="middle"
                >
                  {leaf.scheme.slice(0,1)}
                </text>
              </motion.g>
            )
          })}
        </svg>
      </div>
      <div className="flex gap-4 mt-4 text-xs font-medium text-muted">
         <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-[#238636]"></div> Lamport</span>
         <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-[#58a6ff]"></div> Falcon</span>
         <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-[#e3b341]"></div> ECDSA</span>
      </div>
    </div>
  )
}
