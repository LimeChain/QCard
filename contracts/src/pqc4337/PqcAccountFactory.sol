// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {ISigVerifier} from "InterfaceVerifier/IVerifier.sol";
import {FalconEthAccount} from "./FalconEthAccount.sol";
import {MlDsaEthAccount} from "./MlDsaEthAccount.sol";

/// @title PqcAccountFactory
/// @notice CREATE2 factory for scheme-specific PQC accounts (Falcon-ETH and ML-DSA-ETH).
contract PqcAccountFactory {
    address public immutable ENTRY_POINT;
    ISigVerifier public immutable FALCON_ETH_VERIFIER;
    ISigVerifier public immutable MLDSA_ETH_VERIFIER;

    event FalconEthAccountCreated(address indexed account, address indexed owner, bytes publicKeyPointer);
    event MlDsaEthAccountCreated(address indexed account, address indexed owner, bytes publicKeyPointer);

    constructor(
        address _entryPoint,
        ISigVerifier _falconEthVerifier,
        ISigVerifier _mldsaEthVerifier
    ) {
        ENTRY_POINT = _entryPoint;
        FALCON_ETH_VERIFIER = _falconEthVerifier;
        MLDSA_ETH_VERIFIER = _mldsaEthVerifier;
    }

    function createFalconAccount(
        address owner,
        bytes calldata publicKeyPointer,
        uint256 salt
    ) external returns (FalconEthAccount account) {
        account = new FalconEthAccount{salt: bytes32(salt)}(
            ENTRY_POINT,
            FALCON_ETH_VERIFIER,
            owner,
            publicKeyPointer
        );
        emit FalconEthAccountCreated(address(account), owner, publicKeyPointer);
    }

    /// @notice Atomically register Falcon-ETH key and deploy account in one tx.
    function createFalconAccountWithKey(
        address owner,
        bytes calldata encodedPublicKey,
        uint256 salt
    ) external returns (FalconEthAccount account, bytes memory publicKeyPointer) {
        publicKeyPointer = FALCON_ETH_VERIFIER.setKey(encodedPublicKey);
        account = new FalconEthAccount{salt: bytes32(salt)}(
            ENTRY_POINT,
            FALCON_ETH_VERIFIER,
            owner,
            publicKeyPointer
        );
        emit FalconEthAccountCreated(address(account), owner, publicKeyPointer);
    }

    function createMlDsaEthAccount(
        address owner,
        bytes calldata publicKeyPointer,
        uint256 salt
    ) external returns (MlDsaEthAccount account) {
        account = new MlDsaEthAccount{salt: bytes32(salt)}(
            ENTRY_POINT,
            MLDSA_ETH_VERIFIER,
            owner,
            publicKeyPointer
        );
        emit MlDsaEthAccountCreated(address(account), owner, publicKeyPointer);
    }

    /// @notice Atomically register ML-DSA-ETH key and deploy account in one tx.
    function createMlDsaEthAccountWithKey(
        address owner,
        bytes calldata encodedPublicKey,
        uint256 salt
    ) external returns (MlDsaEthAccount account, bytes memory publicKeyPointer) {
        publicKeyPointer = MLDSA_ETH_VERIFIER.setKey(encodedPublicKey);
        account = new MlDsaEthAccount{salt: bytes32(salt)}(
            ENTRY_POINT,
            MLDSA_ETH_VERIFIER,
            owner,
            publicKeyPointer
        );
        emit MlDsaEthAccountCreated(address(account), owner, publicKeyPointer);
    }

    function getFalconAccountAddress(
        address owner,
        bytes calldata publicKeyPointer,
        uint256 salt
    ) external view returns (address) {
        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                bytes32(salt),
                keccak256(
                    abi.encodePacked(
                        type(FalconEthAccount).creationCode,
                        abi.encode(ENTRY_POINT, FALCON_ETH_VERIFIER, owner, publicKeyPointer)
                    )
                )
            )
        );
        return address(uint160(uint256(hash)));
    }

    function getMlDsaEthAccountAddress(
        address owner,
        bytes calldata publicKeyPointer,
        uint256 salt
    ) external view returns (address) {
        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                bytes32(salt),
                keccak256(
                    abi.encodePacked(
                        type(MlDsaEthAccount).creationCode,
                        abi.encode(ENTRY_POINT, MLDSA_ETH_VERIFIER, owner, publicKeyPointer)
                    )
                )
            )
        );
        return address(uint160(uint256(hash)));
    }
}
