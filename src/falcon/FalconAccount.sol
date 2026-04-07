// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {IAccount, UserOperation} from "../interfaces/IAccount.sol";
import {ISigVerifier} from "InterfaceVerifier/IVerifier.sol";

/// @title FalconAccount — Quantum-resistant smart account using Falcon-512 (ETHFALCON)
/// @notice ERC-4337 compatible account that verifies Falcon-512 lattice-based signatures.
///         Uses ZKNox's ETHFALCON variant (Keccak instead of SHAKE) for ~1.5M gas verification.
///
/// Architecture:
///   - Public key (897 bytes in NTT domain) is stored at account creation
///   - Off-chain signer generates Falcon-512 signatures
///   - validateUserOp calls ETHFALCON.verify() to check the signature
///   - Gas cost: ~1.5M per verification (vs 3,000 for ECDSA)
contract FalconAccount is IAccount {
    ISigVerifier public immutable FALCON_VERIFIER;
    address public immutable ENTRY_POINT;
    address public owner;
    uint256 public nonce;

    // Falcon public key stored as SSTORE2 pointer (returned from setKey)
    bytes public storedPubKeyPointer;

    // The raw public key data for reference
    bytes public rawPublicKey;

    uint256 internal constant SIG_VALIDATION_FAILED = 1;

    event Executed(address indexed target, uint256 value, bytes data);
    event PublicKeyUpdated();

    error OnlyEntryPoint();
    error OnlyOwner();
    error ExecutionFailed();
    error PublicKeyNotSet();

    modifier onlyOwner() {
        _onlyOwner();
        _;
    }

    function _onlyOwner() internal view {
        if (msg.sender != owner) revert OnlyOwner();
    }

    // ISigVerifier.verify.selector = bytes4(keccak256("verify(bytes,bytes32,bytes)"))
    bytes4 internal constant VERIFY_SUCCESS = 0x024ad318;

    constructor(address _falconVerifier, bytes memory _publicKey, address _entryPoint, address _owner) {
        FALCON_VERIFIER = ISigVerifier(_falconVerifier);
        ENTRY_POINT = _entryPoint;
        owner = _owner;

        // Store the public key via ETHFALCON's setKey (uses SSTORE2)
        if (_publicKey.length > 0) {
            storedPubKeyPointer = FALCON_VERIFIER.setKey(_publicKey);
            rawPublicKey = _publicKey;
        }
    }

    /// @notice ERC-4337 signature validation using Falcon-512
    /// @dev Signature format: raw Falcon signature bytes (salt + s2 encoded)
    ///      The public key is read from the stored SSTORE2 pointer
    function validateUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external override returns (uint256 validationData) {
        if (msg.sender != ENTRY_POINT) revert OnlyEntryPoint();
        if (storedPubKeyPointer.length == 0) revert PublicKeyNotSet();
        if (userOp.sender != address(this) || userOp.nonce != nonce) {
            return SIG_VALIDATION_FAILED;
        }

        bytes4 result = FALCON_VERIFIER.verify(
            storedPubKeyPointer,
            userOpHash,
            userOp.signature
        );

        if (result != VERIFY_SUCCESS) {
            return SIG_VALIDATION_FAILED;
        }

        nonce++;

        if (missingAccountFunds > 0) {
            (bool success,) = payable(ENTRY_POINT).call{value: missingAccountFunds}("");
            (success);
        }

        return 0;
    }

    error OnlyEntryPointOrOwner();

    /// @notice Execute a call from this account (only owner or EntryPoint after validation)
    function execute(address target, uint256 value, bytes calldata data) external {
        if (msg.sender != owner && msg.sender != ENTRY_POINT) revert OnlyEntryPointOrOwner();
        (bool success,) = target.call{value: value}(data);
        if (!success) revert ExecutionFailed();
        emit Executed(target, value, data);
    }

    /// @notice Update the Falcon public key
    function updatePublicKey(bytes memory newKey) external onlyOwner {
        storedPubKeyPointer = FALCON_VERIFIER.setKey(newKey);
        rawPublicKey = newKey;
        emit PublicKeyUpdated();
    }

    receive() external payable {}
}
