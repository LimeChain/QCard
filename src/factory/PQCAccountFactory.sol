// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {LamportVerifier} from "../lamport/LamportVerifier.sol";
import {LamportAccount} from "../lamport/LamportAccount.sol";
import {FalconAccount} from "../falcon/FalconAccount.sol";

/// @title PQCAccountFactory — Deploys quantum-resistant smart accounts
/// @notice CREATE2 factory for deterministic account addresses.
///         Supports both Lamport (hash-based) and Falcon (lattice-based) accounts.
contract PQCAccountFactory {
    LamportVerifier public immutable lamportVerifier;
    address public immutable falconVerifierAddress;
    address public immutable entryPoint;

    event LamportAccountCreated(address indexed account, address indexed owner);
    event FalconAccountCreated(address indexed account, address indexed owner);

    constructor(address _lamportVerifier, address _falconVerifier, address _entryPoint) {
        lamportVerifier = LamportVerifier(_lamportVerifier);
        falconVerifierAddress = _falconVerifier;
        entryPoint = _entryPoint;
    }

    /// @notice Deploy a new Lamport smart account
    /// @param pubKeyRoot Merkle root of the Lamport leaf roots registered on the account
    /// @param owner The account owner (can rotate keys)
    /// @param salt For deterministic CREATE2 address
    function createLamportAccount(
        bytes32 pubKeyRoot,
        address owner,
        uint256 salt
    ) external returns (LamportAccount account) {
        account = new LamportAccount{salt: bytes32(salt)}(
            address(lamportVerifier),
            pubKeyRoot,
            entryPoint,
            owner
        );
        emit LamportAccountCreated(address(account), owner);
    }

    /// @notice Deploy a new Falcon-512 smart account
    /// @param publicKey The Falcon-512 public key (NTT domain, ~897 bytes)
    /// @param owner The account owner
    /// @param salt For deterministic CREATE2 address
    function createFalconAccount(
        bytes memory publicKey,
        address owner,
        uint256 salt
    ) external returns (FalconAccount account) {
        account = new FalconAccount{salt: bytes32(salt)}(
            falconVerifierAddress,
            publicKey,
            entryPoint,
            owner
        );
        emit FalconAccountCreated(address(account), owner);
    }

    /// @notice Compute the deterministic address of a Lamport account
    function getLamportAccountAddress(
        bytes32 pubKeyRoot,
        address owner,
        uint256 salt
    ) external view returns (address) {
        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                bytes32(salt),
                keccak256(
                    abi.encodePacked(
                        type(LamportAccount).creationCode,
                        abi.encode(address(lamportVerifier), pubKeyRoot, entryPoint, owner)
                    )
                )
            )
        );
        return address(uint160(uint256(hash)));
    }
}
