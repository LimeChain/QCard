// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {ISigVerifier} from "InterfaceVerifier/IVerifier.sol";

/// @title MlDsaEthAccount
/// @notice Scheme-specific ERC-4337 account that validates signatures through
///         a ZKNOX ETHDILITHIUM verifier and a stored SSTORE2 key pointer.
contract MlDsaEthAccount {
    uint256 internal constant SIG_VALIDATION_FAILED = 1;

    address public immutable ENTRY_POINT;
    ISigVerifier public immutable VERIFIER;
    address public owner;
    uint256 public nonce;
    bytes public publicKeyPointer;

    event Executed(address indexed target, uint256 value, bytes data);
    event OwnerUpdated(address indexed newOwner);

    error OnlyEntryPoint();
    error OnlyOwnerOrSelf();
    error ExecutionFailed();

    struct PackedUserOperation {
        address sender;
        uint256 nonce;
        bytes initCode;
        bytes callData;
        bytes32 accountGasLimits;
        uint256 preVerificationGas;
        bytes32 gasFees;
        bytes paymasterAndData;
        bytes signature;
    }

    constructor(
        address _entryPoint,
        ISigVerifier _verifier,
        address _owner,
        bytes memory _publicKeyPointer
    ) {
        ENTRY_POINT = _entryPoint;
        VERIFIER = _verifier;
        owner = _owner;
        publicKeyPointer = _publicKeyPointer;
    }

    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external returns (uint256 validationData) {
        if (msg.sender != ENTRY_POINT) revert OnlyEntryPoint();

        if (missingAccountFunds > 0) {
            (bool success,) = payable(ENTRY_POINT).call{value: missingAccountFunds}("");
            success;
        }

        if (userOp.sender != address(this) || userOp.nonce != nonce) {
            return SIG_VALIDATION_FAILED;
        }

        bytes4 verifyResult;
        try VERIFIER.verify(publicKeyPointer, userOpHash, userOp.signature) returns (bytes4 result) {
            verifyResult = result;
        } catch {
            return SIG_VALIDATION_FAILED;
        }

        if (verifyResult != ISigVerifier.verify.selector) {
            return SIG_VALIDATION_FAILED;
        }

        nonce++;
        return 0;
    }

    function execute(address target, uint256 value, bytes calldata data) external {
        if (msg.sender != owner && msg.sender != ENTRY_POINT && msg.sender != address(this)) {
            revert OnlyOwnerOrSelf();
        }
        (bool success,) = target.call{value: value}(data);
        if (!success) revert ExecutionFailed();
        emit Executed(target, value, data);
    }

    function updateOwner(address newOwner) external {
        if (msg.sender != address(this)) revert OnlyOwnerOrSelf();
        owner = newOwner;
        emit OwnerUpdated(newOwner);
    }

    receive() external payable {}
}
