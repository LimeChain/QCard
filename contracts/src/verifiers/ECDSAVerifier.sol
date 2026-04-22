// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {ISchemeVerifier} from "./ISchemeVerifier.sol";

/// @title ECDSAVerifier -- Hybrid/fallback ECDSA leaf verification
/// @notice Allows HCA accounts to include ECDSA-secured leaves alongside PQC leaves.
///         sigData format: abi.encode(address expectedSigner, bytes ecdsaSig)
///
///         The frontend signs with `personal_sign` (EIP-191), which prefixes the hash as:
///         keccak256("\x19Ethereum Signed Message:\n32" || msgHash)
///         We apply the same prefix here before ecrecover.
contract ECDSAVerifier is ISchemeVerifier {
    /// @inheritdoc ISchemeVerifier
    function verify(bytes32 msgHash, bytes calldata sigData) external pure override returns (bool) {
        (address expectedSigner, bytes memory ecdsaSig) = abi.decode(sigData, (address, bytes));

        if (ecdsaSig.length != 65) return false;

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(ecdsaSig, 32))
            s := mload(add(ecdsaSig, 64))
            v := byte(0, mload(add(ecdsaSig, 96)))
        }

        if (v < 27) v += 27;
        if (v != 27 && v != 28) return false;

        // Reject malleable signatures (s must be in the lower half)
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            return false;
        }

        // personal_sign (EIP-191) prefixes the 32-byte hash before signing.
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", msgHash));
        address recovered = ecrecover(ethSignedHash, v, r, s);
        return recovered != address(0) && recovered == expectedSigner;
    }
}
