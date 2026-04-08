# PQC EVM Tutorial — Hash-Committed Accounts

Interactive wizard for creating and using quantum-resistant Ethereum accounts. Implements the [EIP-8215](https://eips.ethereum.org/EIPS/eip-8215) Hash-Committed Accounts model with scheme-agnostic Merkle leaves.

## What It Does

A 6-step browser wizard that creates a quantum-resistant smart account on Base Sepolia:

1. **Configure** — pick signature schemes per leaf (Lamport, Falcon, ECDSA)
2. **Generate Keys** — browser-side keygen via CSPRNG + keccak256 (seed never leaves the browser)
3. **Deploy** — deploy HCA smart account via factory contract
4. **Fund** — send test ETH to the account
5. **Sign & Submit** — sign a transaction with a one-time Lamport key, submit via bundler
6. **Verify** — confirm the PQC transaction on-chain

All crypto runs in the browser. No backend. The seed is encrypted with AES-256-GCM before storage.

## Quick Start

```bash
git clone https://github.com/LimeChain/pqc-evm-tutorial.git
cd pqc-evm-tutorial
npm install

# Copy env and fill in contract addresses (or deploy your own)
cp .env.example .env.local

# Run dev server
npm run dev
# Open http://localhost:3000
```

## Deploy Contracts

Requires [Foundry](https://getfoundry.sh/) and Base Sepolia ETH.

```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash && foundryup

# Install contract dependencies
cd contracts && forge install && cd ..

# Set deploy key
export PRIVATE_KEY=0xYOUR_KEY
export BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# Deploy
./scripts/deploy.sh

# Or manually:
cd contracts
forge script script/DeployHCA.s.sol \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --broadcast \
  --sender $(cast wallet address --private-key $PRIVATE_KEY) \
  --private-key $PRIVATE_KEY
```

After deploying, update `.env.local` with the printed addresses.

## Architecture

```
Browser (Next.js)                    Base Sepolia
  |                                      |
  |-- 1. Generate seed (CSPRNG)          |
  |-- 2. Derive Lamport keypairs         |
  |-- 3. Compute authRoot (Merkle)       |
  |                                      |
  |-- 4. Deploy HCAAccount -----------> Factory.createAccount(authRoot)
  |-- 5. Fund account ----------------> send ETH
  |                                      |
  |-- 6. Sign userOpHash (Lamport)       |
  |-- 7. Submit UserOp ---------------> Bundler → EntryPoint → HCAAccount
  |                                      |       validateUserOp():
  |                                      |         - verify Merkle proof
  |                                      |         - dispatch to LamportVerifier
  |                                      |         - check 256 keccak256 preimages
  |                                      |       execute():
  |                                      |         - send ETH to recipient
```

## Deployed Addresses (Base Sepolia)

| Contract | Address |
|----------|---------|
| EntryPoint v0.6 | `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` |
| LamportVerifier | `0xE03871084c84d999A71932E5CA6bcDe585Fed583` |
| ECDSAVerifier | `0xBc009eA3c3BC09C33334E1dA532cD659281D96D6` |
| HCAFactory | `0xfbe3FECe2851fA9c8B077fEfFF93B871c32F683D` |

## Project Structure

```
contracts/                    # Foundry — HCA smart contracts
  src/
    HCAAccount.sol            # Scheme-agnostic ERC-4337 account
    HCAFactory.sol            # CREATE2 factory
    verifiers/
      ISchemeVerifier.sol     # Shared verifier interface
      LamportVerifier.sol     # Hash-based (keccak256-only)
      FalconVerifier.sol      # Lattice-based (ZKNox ETHFALCON)
      ECDSAVerifier.sol       # Classical (hybrid/fallback)
  test/                       # 18 passing tests
  script/                     # Deploy scripts
  lib/                        # ETHFALCON, forge-std, sstore2
src/                          # Next.js app
  app/                        # App router
  components/
    steps/                    # 6 wizard step components
    ui/                       # Design system primitives
    MerkleTreeViz.tsx         # Animated tree visualization
  lib/
    crypto/                   # Browser-side keccak, Lamport, Falcon, seed encryption
    contracts/                # ABIs and addresses
    bundler/                  # Pimlico ERC-4337 client
    store.tsx                 # Wizard state (React Context)
scripts/                      # Deploy and wire convenience scripts
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| Wallet | wagmi v3, viem v2, WalletConnect |
| Crypto | js-sha3 (keccak), Web Crypto API (AES-GCM), fn-dsa (Falcon) |
| Contracts | Foundry, Solidity 0.8.34 |
| Bundler | Pimlico (Base Sepolia) |
| Chain | Base Sepolia (84532) |

## Key Design: Version Bytes

Each leaf in the Merkle tree has a version byte that selects the verification scheme:

| Version | Scheme | Verifier | Gas Cost |
|---------|--------|----------|----------|
| `0x01` | Lamport | LamportVerifier | ~297K |
| `0x02` | Falcon | FalconVerifier | ~1.5M |
| `0x03` | ECDSA | ECDSAVerifier | ~25K |

One account can have leaves of different schemes. Start with ECDSA for backward compatibility, add Lamport/Falcon leaves for quantum resistance, then stop using ECDSA leaves when ready.

## References

- [EIP-8215: Hash-Committed Accounts](https://eips.ethereum.org/EIPS/eip-8215)
- [eth-hca/hca-rs](https://github.com/eth-hca/hca-rs) — Rust reference implementation
- [ZKNoxHQ/ETHFALCON](https://github.com/ZKNoxHQ/ETHFALCON) — EVM Falcon-512 verifier
- [pornin/js-fn-dsa](https://github.com/pornin/js-fn-dsa) — Browser Falcon signing
- [pq.ethereum.org](https://pq.ethereum.org/) — Ethereum Foundation PQ hub

## License

MIT
