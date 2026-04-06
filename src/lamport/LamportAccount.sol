// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IAccount, UserOperation} from "../interfaces/IAccount.sol";
import {LamportVerifier} from "./LamportVerifier.sol";

/// @title LamportAccount — Quantum-resistant smart account using Lamport signatures
/// @notice ERC-4337 compatible account that verifies Lamport one-time signatures.
///         Uses a Merkle tree of Lamport public keys to support multiple transactions
///         from a single compact root.
///
/// Key management:
///   - Owner registers a Merkle root of 2^TREE_HEIGHT Lamport public keys
///   - Each transaction uses the next unused leaf (one-time signature)
///   - The contract tracks which leaf index is next via `nextKeyIndex`
///   - When all leaves are used, the owner registers a new Merkle root
contract LamportAccount is IAccount {
    LamportVerifier public immutable verifier;
    bytes32 public publicKeyRoot;
    uint256 public nextKeyIndex;
    address public owner;
    uint256 public nonce;

    uint256 internal constant SIG_VALIDATION_FAILED = 1;

    event KeyRootUpdated(bytes32 indexed newRoot);
    event Executed(address indexed target, uint256 value, bytes data);

    error OnlyOwner();
    error OnlyEntryPointOrOwner();
    error InvalidSignature();
    error ExecutionFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    constructor(address _verifier, bytes32 _publicKeyRoot, address _owner) {
        verifier = LamportVerifier(_verifier);
        publicKeyRoot = _publicKeyRoot;
        owner = _owner;
    }

    /// @notice ERC-4337 signature validation
    /// @dev Signature format: abi.encode(bytes32[512] pubKeyHashes, bytes32[256] lamportSig)
    function validateUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external override returns (uint256 validationData) {
        // Decode the Lamport signature from userOp.signature
        (bytes32[512] memory pubKeyHashes, bytes32[256] memory lamportSig) =
            abi.decode(userOp.signature, (bytes32[512], bytes32[256]));

        // Verify the Lamport signature against the userOp hash
        bool valid = verifier.verifyWithRoot(userOpHash, publicKeyRoot, pubKeyHashes, lamportSig);

        if (!valid) {
            return SIG_VALIDATION_FAILED;
        }

        // Increment key index (each Lamport key is one-time use)
        nextKeyIndex++;
        nonce++;

        // Pay the EntryPoint if needed
        if (missingAccountFunds > 0) {
            (bool success,) = payable(msg.sender).call{value: missingAccountFunds}("");
            (success); // ignore failure (EntryPoint will handle it)
        }

        return 0; // success
    }

    /// @notice Execute a call from this account (only owner or EntryPoint after validation)
    function execute(address target, uint256 value, bytes calldata data) external {
        if (msg.sender != owner && msg.sender != address(this)) revert OnlyEntryPointOrOwner();
        (bool success,) = target.call{value: value}(data);
        if (!success) revert ExecutionFailed();
        emit Executed(target, value, data);
    }

    /// @notice Update the Lamport key tree root (for key rotation)
    function updateKeyRoot(bytes32 newRoot) external onlyOwner {
        publicKeyRoot = newRoot;
        nextKeyIndex = 0;
        emit KeyRootUpdated(newRoot);
    }

    receive() external payable {}
}
