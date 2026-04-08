// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {HCAAccount} from "./HCAAccount.sol";

/// @title HCAFactory -- CREATE2 factory for scheme-agnostic HCA accounts
/// @notice Deploys deterministic HCAAccount instances pre-configured with
///         Lamport (0x01), Falcon (0x02), and ECDSA (0x03) verifiers.
contract HCAFactory {
    address public immutable LAMPORT_VERIFIER;
    address public immutable FALCON_VERIFIER;
    address public immutable ECDSA_VERIFIER;
    address public immutable ENTRY_POINT;

    event AccountCreated(address indexed account, address indexed owner, bytes32 authRoot);

    constructor(
        address _lamportVerifier,
        address _falconVerifier,
        address _ecdsaVerifier,
        address _entryPoint
    ) {
        LAMPORT_VERIFIER = _lamportVerifier;
        FALCON_VERIFIER = _falconVerifier;
        ECDSA_VERIFIER = _ecdsaVerifier;
        ENTRY_POINT = _entryPoint;
    }

    /// @notice Deploy a new HCAAccount with all three verifiers registered
    /// @param authRoot Merkle root of the versioned spending rules
    /// @param owner Account owner (can rotate keys via execute)
    /// @param salt For deterministic CREATE2 address
    function createAccount(
        bytes32 authRoot,
        address owner,
        uint256 salt
    ) external returns (HCAAccount account) {
        uint8[] memory versions = new uint8[](3);
        address[] memory verifierAddrs = new address[](3);

        versions[0] = 0x01;
        verifierAddrs[0] = LAMPORT_VERIFIER;

        versions[1] = 0x02;
        verifierAddrs[1] = FALCON_VERIFIER;

        versions[2] = 0x03;
        verifierAddrs[2] = ECDSA_VERIFIER;

        account = new HCAAccount{salt: bytes32(salt)}(
            authRoot,
            ENTRY_POINT,
            owner,
            versions,
            verifierAddrs
        );

        emit AccountCreated(address(account), owner, authRoot);
    }

    /// @notice Compute the deterministic address for an account
    function getAccountAddress(
        bytes32 authRoot,
        address owner,
        uint256 salt
    ) external view returns (address) {
        uint8[] memory versions = new uint8[](3);
        address[] memory verifierAddrs = new address[](3);

        versions[0] = 0x01;
        verifierAddrs[0] = LAMPORT_VERIFIER;

        versions[1] = 0x02;
        verifierAddrs[1] = FALCON_VERIFIER;

        versions[2] = 0x03;
        verifierAddrs[2] = ECDSA_VERIFIER;

        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                bytes32(salt),
                keccak256(
                    abi.encodePacked(
                        type(HCAAccount).creationCode,
                        abi.encode(authRoot, ENTRY_POINT, owner, versions, verifierAddrs)
                    )
                )
            )
        );
        return address(uint160(uint256(hash)));
    }
}
