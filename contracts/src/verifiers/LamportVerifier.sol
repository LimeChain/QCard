// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {ISchemeVerifier} from "./ISchemeVerifier.sol";

/// @title LamportVerifier -- Quantum-resistant signature verification via keccak256
/// @notice Lamport one-time signatures: 256 hash preimage comparisons.
///         sigData format: abi.encode(bytes32[512] pubKeyHashes, bytes32[256] lamportSig)
contract LamportVerifier is ISchemeVerifier {
    /// @inheritdoc ISchemeVerifier
    function verify(bytes32 msgHash, bytes calldata sigData) external pure override returns (bool) {
        (bytes32[512] memory pubKeyHashes, bytes32[256] memory lamportSig) =
            abi.decode(sigData, (bytes32[512], bytes32[256]));

        for (uint256 i = 0; i < 256; i++) {
            uint256 bit = (uint256(msgHash) >> (255 - i)) & 1;
            bytes32 computed = keccak256(abi.encodePacked(lamportSig[i]));
            bytes32 expected = pubKeyHashes[2 * i + bit];
            if (computed != expected) {
                return false;
            }
        }
        return true;
    }
}
