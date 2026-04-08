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
git clone https://github.com/LimeChain/pqc-hca-poc.git
cd pqc-hca-poc
npm install

cp .env.example .env.local
# Fill in contract addresses (deploy your own or get from your team) and Pimlico API key

npm run dev
# Open http://localhost:3000
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_HCA_FACTORY` | Yes | HCAFactory contract address |
| `NEXT_PUBLIC_LAMPORT_VERIFIER` | Yes | LamportVerifier contract address |
| `NEXT_PUBLIC_ECDSA_VERIFIER` | Yes | ECDSAVerifier contract address |
| `NEXT_PUBLIC_FALCON_VERIFIER` | No | FalconVerifier address (set to `0x0...0` if not deployed) |
| `NEXT_PUBLIC_PIMLICO_API_KEY` | For bundler | Get one at [dashboard.pimlico.io](https://dashboard.pimlico.io/) (free tier works for testnet) |

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
  |-- 6. Sign userOpHash (Lamport)       |
  |-- 7. Submit UserOp ---------------> Bundler -> EntryPoint -> HCAAccount
  |                                      |       validateUserOp():
  |                                      |         - verify Merkle proof
  |                                      |         - dispatch to verifier[version]
  |                                      |         - check signature
  |                                      |       execute():
  |                                      |         - send ETH to recipient
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
