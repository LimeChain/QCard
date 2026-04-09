# PQC HCA PoC

Interactive wizard for creating and using quantum-resistant Ethereum accounts. Implements the [Hash-Committed Account (HCA)](https://ethereum-magicians.org/t/eip-8215-hash-committed-account-hca/28094) model with scheme-agnostic Merkle leaves.

## What It Does

A 6-step browser wizard that creates a quantum-resistant smart account on Sepolia:

1. **Configure** -- pick signature schemes per leaf (Lamport, Falcon, ECDSA)
2. **Generate Keys** -- browser-side keygen via CSPRNG + keccak256 (seed never leaves the browser)
3. **Deploy** -- deploy HCA smart account via factory contract
4. **Fund** -- send test ETH to the account
5. **Sign & Submit** -- sign a transaction with a PQC key, submit via bundler
6. **Verify** -- confirm the PQC transaction on-chain

All crypto runs in the browser. No backend. The seed is encrypted with AES-256-GCM before storage.

## Quick Start

```bash
git clone --recurse-submodules https://github.com/LimeChain/pqc-hca-poc.git
cd pqc-hca-poc
npm install

cp .env.example .env.local
# Fill in contract addresses (deploy your own or get from your team) and Pimlico API key

# Set up the Falcon backend (Python venv for ZKNox ETHFALCON signer)
./scripts/setup-falcon.sh

npm run dev
# Open http://localhost:3000
```

> **Why Python?** Browser Falcon libraries (`js-fn-dsa`, `@noble/post-quantum`, `@tectonic-labs/bedrock-wasm`) don't produce byte-compatible output for ZKNox's on-chain ETHFALCON verifier. We shell out to ZKNox's reference Python signer via `/api/falcon/{keygen,sign}` to get signatures that verify on-chain. Lamport and ECDSA leaves stay fully browser-side.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_HCA_FACTORY` | Yes | HCAFactory contract address |
| `NEXT_PUBLIC_LAMPORT_VERIFIER` | Yes | LamportVerifier contract address |
| `NEXT_PUBLIC_ECDSA_VERIFIER` | Yes | ECDSAVerifier contract address |
| `NEXT_PUBLIC_FALCON_VERIFIER` | No | FalconVerifier address (set to `0x0...0` if not deployed) |
| `NEXT_PUBLIC_PIMLICO_API_KEY` | For PQC flow | ERC-4337 bundler key. Without it, the app falls back to direct MetaMask calls (no PQC verification on-chain). Free tier at [dashboard.pimlico.io](https://dashboard.pimlico.io/) |

## Deploy Contracts

Requires [Foundry](https://getfoundry.sh/) and Sepolia ETH.

```bash
curl -L https://foundry.paradigm.xyz | bash && foundryup

cd contracts && forge install && cd ..

export PRIVATE_KEY=0xYOUR_KEY
export SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY

./scripts/deploy.sh
```

Or manually:

```bash
cd contracts
forge script script/DeployHCA.s.sol \
  --rpc-url $SEPOLIA_RPC_URL \
  --broadcast \
  --sender $(cast wallet address --private-key $PRIVATE_KEY) \
  --private-key $PRIVATE_KEY
```

After deploying, run `./scripts/wire.sh <factory> <lamport> <ecdsa> <falcon>` to update `.env.local`, or fill it in manually.

Verify deployment: `./scripts/verify.sh`

## Architecture

### Why a bundler?

Ethereum's protocol only validates ECDSA signatures. A Lamport-signed transaction can't be sent directly to the network — it would be rejected at the mempool level before reaching any contract. [ERC-4337 Account Abstraction](https://eips.ethereum.org/EIPS/eip-4337) solves this by moving signature verification from the protocol into a smart contract:

1. **You** build a UserOperation (a data blob, not a transaction) and sign it with your PQC key
2. **The bundler** (Pimlico) wraps your UserOperation in a regular ECDSA-signed transaction and submits it to the EntryPoint contract
3. **The EntryPoint** calls your HCA account's `validateUserOp()`, which verifies the PQC signature on-chain
4. **If valid**, the EntryPoint calls `execute()` to perform the actual action (send ETH, call a contract, etc.)

The bundler is the bridge between PQC-signed intents and Ethereum's ECDSA-only mempool. Without it, there's no way to get a Lamport or Falcon signature verified on-chain. The app's "Direct Wallet Mode" fallback calls `execute()` from MetaMask directly — but that uses regular ECDSA and skips PQC verification entirely.

[Pimlico](https://pimlico.io/) is the bundler service used here. Free tier works for testnet. Get an API key at [dashboard.pimlico.io](https://dashboard.pimlico.io/).

### Flow

```
Browser (Next.js)                    Sepolia
  |                                      |
  |-- 1. Generate seed (CSPRNG)          |
  |-- 2. Derive Lamport keypairs         |
  |-- 3. Compute authRoot (Merkle)       |
  |                                      |
  |-- 4. Deploy HCAAccount -----------> Factory.createAccount(authRoot)
  |-- 5. Fund account ----------------> send ETH
  |                                      |
  |-- 6. Sign userOpHash (PQC key)       |
  |-- 7. Submit UserOp ------.           |
  |                           |          |
  |    Pimlico bundler <------'          |
  |      wraps UserOp in a regular       |
  |      ECDSA tx and calls:             |
  |                           |          |
  |                           '-------> EntryPoint.handleOps()
  |                                      |-> HCAAccount.validateUserOp()
  |                                      |     verify Merkle proof
  |                                      |     dispatch to verifier[version]
  |                                      |     LamportVerifier.verify() <-- PQC check
  |                                      |-> HCAAccount.execute()
  |                                      |     send ETH to recipient
```

## Version Bytes

Each leaf in the Merkle tree has a version byte that selects the verification scheme:

| Version | Scheme | Verifier | Gas Cost |
|---------|--------|----------|----------|
| `0x01` | Lamport | LamportVerifier | ~297K |
| `0x02` | Falcon | FalconVerifier | ~1.5M |
| `0x03` | ECDSA | ECDSAVerifier | ~25K |

One account can have leaves of different schemes. Start with ECDSA for backward compatibility, add Lamport/Falcon leaves for quantum resistance, then stop using ECDSA leaves when ready.

## License

MIT
