"use client"

import * as React from "react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AppFlow = "hca" | "pqc4337"
export type Pqc4337Scheme = "falcon-eth" | "mldsa-eth"

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

export interface FalconLeafKey {
  leafIndex: number
  /** 32-byte seed (hex) passed to the Python backend to derive the deterministic keypair */
  leafSeedHex: string
  /** NTT-compacted public key: 32 uint256 hex strings (Solidity-ready) */
  pkCompact: string[]
}

export interface Pqc4337Keypair {
  publicKeyHex: `0x${string}`
  secretKeyHex: `0x${string}`
  encodedPublicKey: `0x${string}`
}

export interface Pqc4337Registration {
  verifierAddress: `0x${string}`
  publicKeyPointer: `0x${string}`
  txHash: string | null
}

export interface Pqc4337Deployment {
  scheme: Pqc4337Scheme
  accountAddress: `0x${string}`
  factoryAddress: `0x${string}`
  verifierAddress: `0x${string}`
  entryPointAddress: `0x${string}`
  publicKeyPointer: `0x${string}`
  ownerAddress: `0x${string}`
  salt: string
}

export interface Pqc4337State {
  scheme: Pqc4337Scheme
  keypair: Pqc4337Keypair | null
  registration: Pqc4337Registration | null
  deployment: Pqc4337Deployment | null
  lastTxHash: string | null
  lastUserOpHash: string | null
  pimlicoApiKey: string
}

export interface WizardState {
  activeFlow: AppFlow
  leafCount: number
  leaves: LeafConfig[]
  masterSeed: Uint8Array | null
  encryptedSeed: string | null
  authRoot: string | null
  leafRoots: Uint8Array[] | null
  leafHashes: Uint8Array[] | null
  falconKeys: FalconLeafKey[]
  ecdsaAddress: string | null
  deployedAddresses: DeployedAddresses | null
  lastTxHash: string | null
  pimlicoApiKey: string
  pqc4337: Pqc4337State
}

interface WizardActions {
  setActiveFlow: (flow: AppFlow) => void
  setLeafConfig: (leafCount: number, leaves: LeafConfig[]) => void
  setKeygenResult: (data: {
    masterSeed: Uint8Array
    encryptedSeed: string
    authRoot: string
    leafRoots: Uint8Array[]
    leafHashes: Uint8Array[]
    falconKeys: FalconLeafKey[]
    ecdsaAddress: string | null
  }) => void
  setDeployedAddresses: (addresses: DeployedAddresses) => void
  setLastTxHash: (hash: string) => void
  setPimlicoApiKey: (key: string) => void
  markLeafUsed: (leafIndex: number) => void
  setPqc4337Scheme: (scheme: Pqc4337Scheme) => void
  setPqc4337Keypair: (keypair: Pqc4337Keypair) => void
  setPqc4337Registration: (registration: Pqc4337Registration) => void
  setPqc4337Deployment: (deployment: Pqc4337Deployment) => void
  setPqc4337LastTxHash: (hash: string) => void
  setPqc4337LastUserOpHash: (hash: string) => void
  setPqc4337PimlicoApiKey: (key: string) => void
  resetPqc4337: () => void
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
  activeFlow: AppFlow
  leafCount: number
  leaves: LeafConfig[]
  masterSeedHex: string | null
  encryptedSeed: string | null
  authRoot: string | null
  leafRootsHex: string[] | null
  leafHashesHex: string[] | null
  falconKeys: FalconLeafKey[]
  ecdsaAddress: string | null
  deployedAddresses: DeployedAddresses | null
  lastTxHash: string | null
  pimlicoApiKey: string
  pqc4337: Pqc4337State
}

function serialize(state: WizardState): string {
  const s: SerializedState = {
    activeFlow: state.activeFlow,
    leafCount: state.leafCount,
    leaves: state.leaves,
    masterSeedHex: state.masterSeed ? toHex(state.masterSeed) : null,
    encryptedSeed: state.encryptedSeed,
    authRoot: state.authRoot,
    leafRootsHex: state.leafRoots ? state.leafRoots.map(toHex) : null,
    leafHashesHex: state.leafHashes ? state.leafHashes.map(toHex) : null,
    falconKeys: state.falconKeys,
    ecdsaAddress: state.ecdsaAddress,
    deployedAddresses: state.deployedAddresses,
    lastTxHash: state.lastTxHash,
    pimlicoApiKey: state.pimlicoApiKey,
    pqc4337: state.pqc4337,
  }
  return JSON.stringify(s)
}

function deserialize(json: string): WizardState | null {
  try {
    const s: SerializedState = JSON.parse(json)
    return {
      activeFlow: s.activeFlow ?? 'hca',
      leafCount: s.leafCount,
      leaves: s.leaves,
      masterSeed: s.masterSeedHex ? fromHex(s.masterSeedHex) : null,
      encryptedSeed: s.encryptedSeed,
      authRoot: s.authRoot,
      leafRoots: s.leafRootsHex ? s.leafRootsHex.map(fromHex) : null,
      leafHashes: s.leafHashesHex ? s.leafHashesHex.map(fromHex) : null,
      falconKeys: s.falconKeys ?? [],
      ecdsaAddress: s.ecdsaAddress ?? null,
      deployedAddresses: s.deployedAddresses,
      lastTxHash: s.lastTxHash,
      pimlicoApiKey: s.pimlicoApiKey ?? '',
      pqc4337: {
        scheme: s.pqc4337?.scheme ?? 'falcon-eth',
        keypair: s.pqc4337?.keypair ?? null,
        registration: s.pqc4337?.registration ?? null,
        deployment: s.pqc4337?.deployment ?? null,
        lastTxHash: s.pqc4337?.lastTxHash ?? null,
        lastUserOpHash: s.pqc4337?.lastUserOpHash ?? null,
        pimlicoApiKey: s.pqc4337?.pimlicoApiKey ?? '',
      },
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialPqc4337State: Pqc4337State = {
  scheme: 'falcon-eth',
  keypair: null,
  registration: null,
  deployment: null,
  lastTxHash: null,
  lastUserOpHash: null,
  pimlicoApiKey: '',
}

const initialState: WizardState = {
  activeFlow: 'hca',
  leafCount: 16,
  leaves: [],
  masterSeed: null,
  encryptedSeed: null,
  authRoot: null,
  leafRoots: null,
  leafHashes: null,
  falconKeys: [],
  ecdsaAddress: null,
  deployedAddresses: null,
  lastTxHash: null,
  pimlicoApiKey: '',
  pqc4337: initialPqc4337State,
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const WizardContext = React.createContext<WizardContextValue | null>(null)

export function WizardProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<WizardState>(initialState)
  const [hydrated, setHydrated] = React.useState(false)

  React.useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const restored = deserialize(saved)
      if (restored) setState(restored)
    }
    setHydrated(true)
  }, [])

  React.useEffect(() => {
    if (hydrated) {
      localStorage.setItem(STORAGE_KEY, serialize(state))
    }
  }, [state, hydrated])

  const actions: WizardActions = React.useMemo(() => ({
    setActiveFlow(activeFlow) {
      setState(prev => ({ ...prev, activeFlow }))
    },

    setLeafConfig(leafCount, leaves) {
      setState(prev => ({ ...prev, leafCount, leaves }))
    },

    setKeygenResult({ masterSeed, encryptedSeed, authRoot, leafRoots, leafHashes, falconKeys, ecdsaAddress }) {
      setState(prev => ({
        ...prev,
        masterSeed,
        encryptedSeed,
        authRoot,
        leafRoots,
        leafHashes,
        falconKeys,
        ecdsaAddress,
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

    setPqc4337Scheme(scheme) {
      setState(prev => ({
        ...prev,
        pqc4337: {
          ...prev.pqc4337,
          scheme,
          keypair: null,
          registration: null,
          deployment: null,
          lastTxHash: null,
          lastUserOpHash: null,
        },
      }))
    },

    setPqc4337Keypair(keypair) {
      setState(prev => ({
        ...prev,
        pqc4337: {
          ...prev.pqc4337,
          keypair,
          registration: null,
          deployment: null,
          lastTxHash: null,
          lastUserOpHash: null,
        },
      }))
    },

    setPqc4337Registration(registration) {
      setState(prev => ({
        ...prev,
        pqc4337: {
          ...prev.pqc4337,
          registration,
          deployment: null,
          lastTxHash: registration.txHash,
        },
      }))
    },

    setPqc4337Deployment(deployment) {
      setState(prev => ({
        ...prev,
        pqc4337: {
          ...prev.pqc4337,
          deployment,
        },
      }))
    },

    setPqc4337LastTxHash(hash) {
      setState(prev => ({
        ...prev,
        pqc4337: {
          ...prev.pqc4337,
          lastTxHash: hash,
        },
      }))
    },

    setPqc4337LastUserOpHash(hash) {
      setState(prev => ({
        ...prev,
        pqc4337: {
          ...prev.pqc4337,
          lastUserOpHash: hash,
        },
      }))
    },

    setPqc4337PimlicoApiKey(key) {
      setState(prev => ({
        ...prev,
        pqc4337: {
          ...prev.pqc4337,
          pimlicoApiKey: key,
        },
      }))
    },

    resetPqc4337() {
      setState(prev => ({
        ...prev,
        pqc4337: initialPqc4337State,
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
