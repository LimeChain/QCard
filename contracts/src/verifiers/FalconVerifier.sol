// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {ISchemeVerifier} from "./ISchemeVerifier.sol";
import {ISigVerifier} from "InterfaceVerifier/IVerifier.sol";

/// @title FalconVerifier -- Wrapper around ZKNox ETHFALCON for HCA dispatch
/// @notice Translates ISchemeVerifier.verify() calls to ISigVerifier.verify().
///         sigData format: abi.encode(bytes pubkeyPointer, bytes falconSig)
contract FalconVerifier is ISchemeVerifier {
    ISigVerifier public immutable FALCON_ENGINE;

    // ISigVerifier.verify.selector = bytes4(keccak256("verify(bytes,bytes32,bytes)"))
    bytes4 internal constant VERIFY_SUCCESS = 0x024ad318;

    constructor(address _falconEngine) {
        FALCON_ENGINE = ISigVerifier(_falconEngine);
    }

    /// @inheritdoc ISchemeVerifier
    function verify(bytes32 msgHash, bytes calldata sigData) external view override returns (bool) {
        (bytes memory pubkeyPointer, bytes memory falconSig) = abi.decode(sigData, (bytes, bytes));
        bytes4 result = FALCON_ENGINE.verify(pubkeyPointer, msgHash, falconSig);
        return result == VERIFY_SUCCESS;
    }
}
