# Building Quantum-Resistant Ethereum: A Hands-On Guide

A step-by-step tutorial with working code for post-quantum signature verification on EVM using account abstraction.

## Prerequisites

- [Foundry](https://getfoundry.sh/) (forge, cast, anvil)
- Python 3.10+
- Git

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

## Setup

```bash
cd book/

# Install git submodules (ETHFALCON, forge-std, sstore2)
forge install

# Compile
forge build
```

If `forge install` fails, install manually:

```bash
forge install foundry-rs/forge-std
forge install ZKNoxHQ/ETHFALCON
forge install 0xsequence/sstore2
```

## Run Tests

```bash
forge test -vv   # All 23 tests
```

Expected:
```
Lamport verify gas: 231,706
LamportAccount validateUserOp gas: 747,316
23 tests passed, 0 failed
```

Per chapter:
```bash
forge test --match-path "test/lamport/*" -vv   # Chapter 2: 12 tests
forge test --match-path "test/falcon/*" -vv    # Chapter 3: 6 tests
forge test --match-path "test/factory/*" -vv   # Chapter 4: 5 tests
```

## Deploy to Base Sepolia

```bash
# 1. Set env vars
export PRIVATE_KEY=0xYOUR_PRIVATE_KEY
export BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# 2. Deploy (LamportVerifier + PQCAccountFactory)
forge script script/DeployFactory.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast
```

Get test ETH: [base.org/faucet](https://www.base.org/faucet) or [Alchemy faucet](https://www.alchemy.com/faucets/base-sepolia).

## Verify Deployment

After deploying, verify contracts work on-chain:

```bash
export VERIFIER_ADDRESS=0x...   # from deploy output
export FACTORY_ADDRESS=0x...    # from deploy output

forge script script/VerifyDeployment.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL -vvvv
```

Expected:
```
PASS: LamportVerifier deployed
PASS: PQCAccountFactory deployed
PASS: Factory references correct LamportVerifier
PASS: Lamport signature verified on-chain
Verification gas: ~231,706
```

## How Signing Works (The Full Flow)

PQC signing happens **off-chain**. MetaMask cannot sign Lamport/Falcon signatures — it only does ECDSA. The architecture:

```
Python CLI signer               Bundler (Pimlico)          On-chain
  |                                |                          |
  |-- 1. Generate PQC keypair     |                          |
  |-- 2. Deploy account (factory) |                          |
  |-- 3. Construct UserOperation  |                          |
  |-- 4. Sign userOpHash with     |                          |
  |       Lamport/Falcon key      |                          |
  |-- 5. Submit UserOp ---------->|-- 6. Simulate ---------> |
  |                                |-- 7. Bundle & send ----> |-- 8. validateUserOp()
  |                                |                          |       (PQC verification)
  |                                |                          |-- 9. execute()
```

**MetaMask can**: Send ETH TO your PQC account (it's just a regular address). View it on BaseScan.

**MetaMask cannot**: Sign transactions FROM your PQC account. You need the Python signer for that.

### Generate a Lamport keypair

```bash
python3 signer/lamport_signer.py genkeys --seed "my-secret-seed"
```

Output:
```
Generated Lamport keypair from seed: my-secret-seed
  Private key: 512 values (16384 bytes)
  Public key:  512 hashes (16384 bytes)
  Merkle root: 0xf1db...
```

### Get the Merkle root (for account creation)

```bash
python3 signer/lamport_signer.py pubroot --seed "my-secret-seed"
# Output: 0xf1db...  <-- pass this to factory.createLamportAccount()
```

### Sign a message hash

```bash
python3 signer/lamport_signer.py sign \
  --seed "my-secret-seed" \
  --message "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
```

Output: JSON with `public_key_hashes` (512 items) and `signature` (256 items) — this goes into `userOp.signature`.

### Create an account via cast

```bash
# Compute Merkle root
PUB_ROOT=$(python3 signer/lamport_signer.py pubroot --seed "my-secret-seed")

# Create account via factory
cast send $FACTORY_ADDRESS \
  "createLamportAccount(bytes32,address,uint256)" \
  $PUB_ROOT \
  $YOUR_ADDRESS \
  0 \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY

# Fund the account
cast send $ACCOUNT_ADDRESS --value 0.01ether \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY
```

### Read account state

```bash
cast call $ACCOUNT_ADDRESS "publicKeyRoot()(bytes32)" --rpc-url $BASE_SEPOLIA_RPC_URL
cast call $ACCOUNT_ADDRESS "nextKeyIndex()(uint256)" --rpc-url $BASE_SEPOLIA_RPC_URL
cast call $ACCOUNT_ADDRESS "owner()(address)" --rpc-url $BASE_SEPOLIA_RPC_URL
```

## Private Key Storage

| Key Type | Size | Where to Store |
|----------|------|---------------|
| Lamport seed | 32 bytes | Single seed derives all keys. Store in encrypted file or env var. |
| Lamport private key | 16 KB (512 x 32 bytes) | Derived on-demand from seed. Never store the expanded key. |
| Falcon-512 secret key | 1,281 bytes | Store in encrypted file. Generated via ZKNox Python signer. |

The seed is the ONLY secret. Back it up securely. Each Lamport signature uses one leaf — track `nextKeyIndex` to avoid reuse.

## What's Inside

| File | Purpose | Gas |
|------|---------|-----|
| `src/lamport/LamportVerifier.sol` | Pure keccak256 Lamport verification | 231K |
| `src/lamport/LamportAccount.sol` | ERC-4337 smart account (Lamport + Merkle tree) | 747K |
| `src/falcon/FalconAccount.sol` | ERC-4337 smart account (ZKNox ETHFALCON) | ~1.5M |
| `src/factory/PQCAccountFactory.sol` | CREATE2 factory for both account types | -- |
| `script/DeployFactory.s.sol` | Deploy full stack to Base Sepolia | -- |
| `script/DeployLamport.s.sol` | Deploy Lamport verifier only | -- |
| `script/VerifyDeployment.s.sol` | Post-deployment verification | -- |
| `signer/lamport_signer.py` | Off-chain Lamport key gen + signing CLI | -- |

## Open the Tutorial

```bash
open book.html
```

## License

MIT
