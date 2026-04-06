# Building Quantum-Resistant Ethereum: A Hands-On Guide

Read the book first.

- Online: https://htmlpreview.github.io/?https://raw.githubusercontent.com/LimeChain/pqc-evm-tutorial/main/book.html
- Local: `open book.html`
- Source of truth: the repo root is the tutorial project; the book's code blocks point back to files in this repo.

## Prerequisites

- [Foundry](https://getfoundry.sh/) (`forge`, `cast`, `anvil`)
- Python 3.10+
- Git

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

## Setup

The repo itself is the book. Do not `cd book/`.

```bash
git submodule update --init --recursive

python3 -m venv .venv
source .venv/bin/activate
pip install pycryptodome

forge build
```

The project is pinned to Solidity `0.8.34` in `foundry.toml`.

## Run Tests

```bash
forge test -vv
```

Current output highlights:

```text
Lamport verify gas: 231705
LamportAccount validateUserOp gas: 753940
33 tests passed, 0 failed
```

Per chapter:

```bash
forge test --match-path "test/lamport/*" -vv   # Chapter 2: 18 tests
forge test --match-path "test/falcon/*" -vv    # Chapter 3: 10 tests
forge test --match-path "test/factory/*" -vv   # Chapter 4: 5 tests
```

## Deploy to Base Sepolia

```bash
export PRIVATE_KEY=0xYOUR_PRIVATE_KEY
export BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
export FALCON_VERIFIER_ADDRESS=0x...      # optional, for Falcon account support
export ENTRY_POINT_ADDRESS=0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789  # optional override

forge script script/DeployFactory.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast
```

Get test ETH from [Base](https://www.base.org/faucet) or an [Alchemy faucet](https://www.alchemy.com/faucets/base-sepolia).

## Verify Deployment

```bash
export VERIFIER_ADDRESS=0x...
export FACTORY_ADDRESS=0x...
export ENTRY_POINT_ADDRESS=0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789  # optional override

forge script script/VerifyDeployment.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL -vvvv
```

Expected checks:

```text
PASS: LamportVerifier deployed
PASS: PQCAccountFactory deployed
PASS: Factory references correct LamportVerifier
PASS: Factory references correct EntryPoint
PASS: Lamport signature verified on-chain
```

## How Signing Works

PQC signing happens off-chain. MetaMask cannot sign Lamport or Falcon signatures for these accounts; it can only fund them like any other address.

Lamport signing uses an account-level Merkle tree of one-time Lamport keys:

1. Derive a master seed from your secret.
2. Derive many Lamport leaves from that seed.
3. Compute the account root from the leaf roots.
4. Deploy the account with that root.
5. Sign a `userOpHash` with exactly one Lamport leaf.
6. Include the leaf's public key hashes, the Lamport signature, the leaf index, and the Merkle proof in `userOp.signature`.

## Lamport Signer

Generate an account tree summary:

```bash
python3 signer/lamport_signer.py genkeys --seed "my-secret-seed" --leaf-count 16
```

Example output:

```text
Generated Lamport account from seed: my-secret-seed
  Leaf count:  16
  Per leaf:    512 private values / 512 public key hashes
  Signature:   256 revealed preimages (8192 bytes)
  Account root: 0x...
  First leaf:   0x...
```

Compute the account root for `createLamportAccount(...)`:

```bash
python3 signer/lamport_signer.py pubroot --seed "my-secret-seed" --leaf-count 16
```

Sign a `userOpHash` with a specific Lamport leaf:

```bash
python3 signer/lamport_signer.py sign \
  --seed "my-secret-seed" \
  --leaf-count 16 \
  --leaf-index 0 \
  --message "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
```

The signer returns JSON with:

- `account_root`: the account-level root stored on-chain
- `leaf_root`: the root of the consumed Lamport leaf
- `leaf_index`: the Lamport leaf being used
- `merkle_proof`: the proof from that leaf root to `account_root`
- `public_key_hashes`: the 512 public key hashes for that leaf
- `signature`: the 256 revealed preimages

Those values must be ABI-encoded as `(bytes32[512],bytes32[256],uint256,bytes32[])` before assigning them to `userOp.signature`.

`leaf_index` must match the account's current `nextKeyIndex()`.

## Create a Lamport Account via Cast

```bash
PUB_ROOT=$(python3 signer/lamport_signer.py pubroot --seed "my-secret-seed" --leaf-count 16)

cast send $FACTORY_ADDRESS \
  "createLamportAccount(bytes32,address,uint256)" \
  $PUB_ROOT \
  $YOUR_ADDRESS \
  0 \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY
```

Fund the account:

```bash
cast send $ACCOUNT_ADDRESS --value 0.01ether \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY
```

Read account state:

```bash
cast call $ACCOUNT_ADDRESS "publicKeyRoot()(bytes32)" --rpc-url $BASE_SEPOLIA_RPC_URL
cast call $ACCOUNT_ADDRESS "nextKeyIndex()(uint256)" --rpc-url $BASE_SEPOLIA_RPC_URL
cast call $ACCOUNT_ADDRESS "nonce()(uint256)" --rpc-url $BASE_SEPOLIA_RPC_URL
cast call $ACCOUNT_ADDRESS "entryPoint()(address)" --rpc-url $BASE_SEPOLIA_RPC_URL
cast call $ACCOUNT_ADDRESS "owner()(address)" --rpc-url $BASE_SEPOLIA_RPC_URL
```

## Private Key Storage

| Key Type | Size | Where to Store |
|----------|------|---------------|
| Lamport seed | 32 bytes | Store once, derive the whole Lamport account tree from it. |
| Lamport private key material | 16 KB per leaf | Derive on demand from the seed; do not persist expanded keys unless you must. |
| Falcon-512 secret key | 1,281 bytes | Store in an encrypted file or HSM-backed workflow. |

The seed is the only Lamport secret you need to back up. Each Lamport leaf is one-time use.

## What's Inside

| File | Purpose |
|------|---------|
| [`src/lamport/LamportVerifier.sol`](src/lamport/LamportVerifier.sol) | Pure keccak256 Lamport verification plus account-root proof verification |
| [`src/lamport/LamportAccount.sol`](src/lamport/LamportAccount.sol) | ERC-4337 Lamport smart account with EntryPoint and nonce enforcement |
| [`src/falcon/FalconAccount.sol`](src/falcon/FalconAccount.sol) | ERC-4337 Falcon smart account backed by ETHFALCON |
| [`src/factory/PQCAccountFactory.sol`](src/factory/PQCAccountFactory.sol) | CREATE2 factory for Lamport and Falcon accounts |
| [`script/DeployFactory.s.sol`](script/DeployFactory.s.sol) | Deploy the verifier and factory stack |
| [`script/DeployLamport.s.sol`](script/DeployLamport.s.sol) | Deploy only the Lamport verifier |
| [`script/VerifyDeployment.s.sol`](script/VerifyDeployment.s.sol) | Live deployment verification checks |
| [`signer/lamport_signer.py`](signer/lamport_signer.py) | Off-chain Lamport account-tree generation and signing |
| [`book.html`](book.html) | The rendered tutorial/book |

## License

MIT
