// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

/// @title ISchemeVerifier -- Shared interface for all HCA verification schemes
/// @notice Each leaf in the HCA Merkle tree is tagged with a version byte.
///         The HCAAccount dispatches to the verifier registered for that version.
interface ISchemeVerifier {
    /// @notice Verify a signature against a message hash
    /// @param msgHash The hash of the message (typically the ERC-4337 userOpHash)
    /// @param sigData Scheme-specific encoded signature data (includes public key material + signature)
    /// @return True if the signature is valid
    function verify(bytes32 msgHash, bytes calldata sigData) external view returns (bool);
}
