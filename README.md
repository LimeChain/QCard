# Building Quantum-Resistant Ethereum

Start with the book: [`book.html`](book.html)

- Local: `open book.html`
- The repo root is the tutorial project. Do not `cd book/`.
- If you need a public preview for this private repo, publish `book.html` to a static host.

## Quickstart

Requirements:
- Foundry
- Python 3.10+
- Git

```bash
git submodule update --init --recursive

python3 -m venv .venv
source .venv/bin/activate
pip install pycryptodome

forge build
forge test -vv
```

Current baseline:
- Solidity: `0.8.34`
- Tests: `33 passed, 0 failed`
- Lamport verify gas: `231705`
- LamportAccount `validateUserOp` gas: `753940`

## Deploy

```bash
export PRIVATE_KEY=0xYOUR_PRIVATE_KEY
export BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
export FALCON_VERIFIER_ADDRESS=0x...
export ENTRY_POINT_ADDRESS=0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789

forge script script/DeployFactory.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast
```

Verify:

```bash
export VERIFIER_ADDRESS=0x...
export FACTORY_ADDRESS=0x...
forge script script/VerifyDeployment.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL -vvvv
```

## Lamport Signer

Get the account root:

```bash
python3 signer/lamport_signer.py pubroot --seed "my-secret-seed" --leaf-count 16
```

Sign a `userOpHash`:

```bash
python3 signer/lamport_signer.py sign \
  --seed "my-secret-seed" \
  --leaf-count 16 \
  --leaf-index 0 \
  --message "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
```

Encode `userOp.signature` as:

```text
(bytes32[512],bytes32[256],uint256,bytes32[])
```

## Files

- [`book.html`](book.html): rendered tutorial
- [`src/lamport/LamportVerifier.sol`](src/lamport/LamportVerifier.sol): Lamport verification + account root proof verification
- [`src/lamport/LamportAccount.sol`](src/lamport/LamportAccount.sol): ERC-4337 Lamport account
- [`src/falcon/FalconAccount.sol`](src/falcon/FalconAccount.sol): ERC-4337 Falcon account
- [`src/factory/PQCAccountFactory.sol`](src/factory/PQCAccountFactory.sol): CREATE2 factory
- [`script/DeployFactory.s.sol`](script/DeployFactory.s.sol): deploy verifier + factory
- [`script/VerifyDeployment.s.sol`](script/VerifyDeployment.s.sol): deployment checks
- [`signer/lamport_signer.py`](signer/lamport_signer.py): off-chain Lamport signer

## License

MIT
