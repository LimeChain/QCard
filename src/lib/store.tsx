"use client"

import * as React from "react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LeafConfig {
  index: number
  scheme: 'Lamport' | 'Falcon' | 'ECDSA'
  used: boolean
}

export interface DeployedAddresses {
  hcaAccount: string
  hcaFactory: string
  lamportVerifier: string
  ecdsaVerifier: string
  falconVerifier: string
}

export interface WizardState {
  // Step 1: Configure
  leafCount: number
  leaves: LeafConfig[]
  // Step 2: Generate Keys
  masterSeed: Uint8Array | null
  encryptedSeed: string | null
  authRoot: string | null
  leafRoots: Uint8Array[] | null
  // Step 3: Deploy
  deployedAddresses: DeployedAddresses | null
  // Step 5: Sign
  lastTxHash: string | null
  pimlicoApiKey: string
}

interface WizardActions {
  setLeafConfig: (leafCount: number, leaves: LeafConfig[]) => void
  setKeygenResult: (data: {
    masterSeed: Uint8Array
    encryptedSeed: string
    authRoot: string
    leafRoots: Uint8Array[]
  }) => void
  setDeployedAddresses: (addresses: DeployedAddresses) => void
  setLastTxHash: (hash: string) => void
  setPimlicoApiKey: (key: string) => void
  markLeafUsed: (leafIndex: number) => void
  reset: () => void
}

type WizardContextValue = WizardState & WizardActions

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState: WizardState = {
  leafCount: 16,
  leaves: [],
  masterSeed: null,
  encryptedSeed: null,
  authRoot: null,
  leafRoots: null,
  deployedAddresses: null,
  lastTxHash: null,
  pimlicoApiKey: '',
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const WizardContext = React.createContext<WizardContextValue | null>(null)

export function WizardProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<WizardState>(initialState)

  const actions: WizardActions = React.useMemo(() => ({
    setLeafConfig(leafCount, leaves) {
      setState(prev => ({ ...prev, leafCount, leaves }))
    },

    setKeygenResult({ masterSeed, encryptedSeed, authRoot, leafRoots }) {
      setState(prev => ({
        ...prev,
        masterSeed,
        encryptedSeed,
        authRoot,
        leafRoots,
      }))
    },

    setDeployedAddresses(addresses) {
      setState(prev => ({ ...prev, deployedAddresses: addresses }))
    },

    setLastTxHash(hash) {
      setState(prev => ({ ...prev, lastTxHash: hash }))
    },

    setPimlicoApiKey(key) {
      setState(prev => ({ ...prev, pimlicoApiKey: key }))
    },

    markLeafUsed(leafIndex) {
      setState(prev => ({
        ...prev,
        leaves: prev.leaves.map(l =>
          l.index === leafIndex ? { ...l, used: true } : l
        ),
      }))
    },

    reset() {
      setState(initialState)
    },
  }), [])

  const value = React.useMemo<WizardContextValue>(
    () => ({ ...state, ...actions }),
    [state, actions],
  )

  return (
    <WizardContext.Provider value={value}>
      {children}
    </WizardContext.Provider>
  )
}

export function useWizard(): WizardContextValue {
  const ctx = React.useContext(WizardContext)
  if (!ctx) {
    throw new Error('useWizard must be used within a WizardProvider')
  }
  return ctx
}
