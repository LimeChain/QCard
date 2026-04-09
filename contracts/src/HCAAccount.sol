// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {IAccount, UserOperation} from "./interfaces/IAccount.sol";
import {ISchemeVerifier} from "./verifiers/ISchemeVerifier.sol";

/// @title HCAAccount -- Scheme-agnostic ERC-4337 account with versioned Merkle leaves
/// @notice Each leaf in the auth tree is tagged with a version byte that selects the
///         signature verification scheme. Supports Lamport (0x01), Falcon (0x02),
///         ECDSA (0x03), and any future scheme by registering new verifiers.
///
/// Leaf structure: keccak256(abi.encodePacked(version_byte, keccak256(commitment)))
/// where commitment is the scheme-specific public data (e.g., pubkey hashes for
/// Lamport, signer address for ECDSA). The signature payload (sigData) is separate
/// and passed to the verifier for actual verification.
///
/// The account owner can rotate the entire auth tree by calling updateAuthRoot
/// through execute (self-call pattern).
contract HCAAccount is IAccount {
    bytes32 public authRoot;
    address public immutable ENTRY_POINT;
    address public owner;
    uint256 public nonce;

    mapping(uint8 => address) public verifiers;

    uint256 internal constant SIG_VALIDATION_FAILED = 1;

    event AuthRootUpdated(bytes32 indexed newRoot);
    event Executed(address indexed target, uint256 value, bytes data);
    event VerifierRegistered(uint8 indexed version, address verifier);

    error OnlyEntryPoint();
    error OnlyOwnerOrSelf();
    error ExecutionFailed();
    error UnknownVersion(uint8 version);

    constructor(
        bytes32 _authRoot,
        address _entryPoint,
        address _owner,
        uint8[] memory versions,
        address[] memory verifierAddrs
    ) {
        require(versions.length == verifierAddrs.length, "HCA: length mismatch");

        authRoot = _authRoot;
        ENTRY_POINT = _entryPoint;
        owner = _owner;

        for (uint256 i = 0; i < versions.length; i++) {
            verifiers[versions[i]] = verifierAddrs[i];
            emit VerifierRegistered(versions[i], verifierAddrs[i]);
        }
    }

    /// @notice ERC-4337 signature validation with scheme dispatch
    /// @dev Signature format:
    ///      abi.encode(uint8 version, uint256 leafIndex, bytes32[] merkleProof, bytes commitment, bytes sigData)
    ///
    ///      commitment = scheme-specific public data committed at tree-build time
    ///      sigData    = full data passed to the verifier (includes commitment + signature)
    ///
    ///      1. Reconstruct the leaf hash: keccak256(version || keccak256(commitment))
    ///      2. Verify the leaf against authRoot via Merkle proof
    ///      3. Dispatch to verifiers[version].verify(userOpHash, sigData)
    function validateUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external override returns (uint256 validationData) {
        if (msg.sender != ENTRY_POINT) revert OnlyEntryPoint();

        // ALWAYS pay the prefund first — matching the canonical SimpleAccount
        // pattern. If we return early without paying, the EntryPoint surfaces
        // a misleading "AA21 didn't pay prefund" error that masks the real
        // signature failure.
        if (missingAccountFunds > 0) {
            (bool success,) = payable(ENTRY_POINT).call{value: missingAccountFunds}("");
            (success); // don't revert on failure; EntryPoint will report AA21 if it matters
        }

        if (userOp.sender != address(this) || userOp.nonce != nonce) {
            return SIG_VALIDATION_FAILED;
        }

        (
            uint8 version,
            uint256 leafIndex,
            bytes32[] memory merkleProof,
            bytes memory commitment,
            bytes memory sigData
        ) = abi.decode(userOp.signature, (uint8, uint256, bytes32[], bytes, bytes));

        // Reconstruct leaf from the commitment (public data committed at tree-build time)
        bytes32 leafHash = keccak256(abi.encodePacked(version, keccak256(commitment)));

        // Verify Merkle proof
        if (!_verifyProof(leafHash, leafIndex, merkleProof, authRoot)) {
            return SIG_VALIDATION_FAILED;
        }

        // Dispatch to the registered verifier
        address verifier = verifiers[version];
        if (verifier == address(0)) revert UnknownVersion(version);

        bool valid = ISchemeVerifier(verifier).verify(userOpHash, sigData);
        if (!valid) {
            return SIG_VALIDATION_FAILED;
        }

        nonce++;
        return 0;
    }

    /// @notice Execute a call from this account
    /// @dev Only callable by the owner, the EntryPoint (after validation), or self (for authRoot rotation)
    function execute(address target, uint256 value, bytes calldata data) external {
        if (msg.sender != owner && msg.sender != ENTRY_POINT && msg.sender != address(this)) {
            revert OnlyOwnerOrSelf();
        }
        (bool success,) = target.call{value: value}(data);
        if (!success) revert ExecutionFailed();
        emit Executed(target, value, data);
    }

    /// @notice Replace the auth Merkle root (key rotation)
    /// @dev Only callable via execute (self-call). The validateUserOp already verified the leaf.
    function updateAuthRoot(bytes32 newRoot) external {
        if (msg.sender != address(this)) revert OnlyOwnerOrSelf();
        authRoot = newRoot;
        emit AuthRootUpdated(newRoot);
    }

    /// @dev Standard Merkle proof verification
    function _verifyProof(
        bytes32 leaf,
        uint256 leafIndex,
        bytes32[] memory proof,
        bytes32 expectedRoot
    ) internal pure returns (bool) {
        bytes32 computed = leaf;
        uint256 idx = leafIndex;

        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 sibling = proof[i];
            if ((idx & 1) == 0) {
                computed = keccak256(abi.encodePacked(computed, sibling));
            } else {
                computed = keccak256(abi.encodePacked(sibling, computed));
            }
            idx >>= 1;
        }

        return computed == expectedRoot;
    }

    receive() external payable {}
}
