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
  leafCount: number
  leaves: LeafConfig[]
  masterSeed: Uint8Array | null
  encryptedSeed: string | null
  authRoot: string | null
  leafRoots: Uint8Array[] | null
  deployedAddresses: DeployedAddresses | null
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
// Persistence helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'hca-wizard-state'

function toHex(arr: Uint8Array): string {
  return '0x' + Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

interface SerializedState {
  leafCount: number
  leaves: LeafConfig[]
  masterSeedHex: string | null
  encryptedSeed: string | null
  authRoot: string | null
  leafRootsHex: string[] | null
  deployedAddresses: DeployedAddresses | null
  lastTxHash: string | null
  pimlicoApiKey: string
}

function serialize(state: WizardState): string {
  const s: SerializedState = {
    leafCount: state.leafCount,
    leaves: state.leaves,
    masterSeedHex: state.masterSeed ? toHex(state.masterSeed) : null,
    encryptedSeed: state.encryptedSeed,
    authRoot: state.authRoot,
    leafRootsHex: state.leafRoots ? state.leafRoots.map(toHex) : null,
    deployedAddresses: state.deployedAddresses,
    lastTxHash: state.lastTxHash,
    pimlicoApiKey: state.pimlicoApiKey,
  }
  return JSON.stringify(s)
}

function deserialize(json: string): WizardState | null {
  try {
    const s: SerializedState = JSON.parse(json)
    return {
      leafCount: s.leafCount,
      leaves: s.leaves,
      masterSeed: s.masterSeedHex ? fromHex(s.masterSeedHex) : null,
      encryptedSeed: s.encryptedSeed,
      authRoot: s.authRoot,
      leafRoots: s.leafRootsHex ? s.leafRootsHex.map(fromHex) : null,
      deployedAddresses: s.deployedAddresses,
      lastTxHash: s.lastTxHash,
      pimlicoApiKey: s.pimlicoApiKey ?? '',
    }
  } catch {
    return null
  }
}

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
  const [hydrated, setHydrated] = React.useState(false)

  // Restore from localStorage on mount
  React.useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const restored = deserialize(saved)
      if (restored) setState(restored)
    }
    setHydrated(true)
  }, [])

  // Persist to localStorage on every state change (after hydration)
  React.useEffect(() => {
    if (hydrated) {
      localStorage.setItem(STORAGE_KEY, serialize(state))
    }
  }, [state, hydrated])

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
      localStorage.removeItem(STORAGE_KEY)
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
