// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

/// @title ERC-4337 v0.6 Account Interface
/// @dev UserOperation struct must match the EntryPoint's definition exactly,
///      including initCode and paymasterAndData, so the function selector
///      and ABI encoding are compatible.
struct UserOperation {
    address sender;
    uint256 nonce;
    bytes initCode;
    bytes callData;
    uint256 callGasLimit;
    uint256 verificationGasLimit;
    uint256 preVerificationGas;
    uint256 maxFeePerGas;
    uint256 maxPriorityFeePerGas;
    bytes paymasterAndData;
    bytes signature;
}

interface IAccount {
    /// @notice Validate a UserOperation's signature
    /// @param userOp The user operation to validate
    /// @param userOpHash Hash of the user operation (signed by the user)
    /// @param missingAccountFunds Funds the account must send to the EntryPoint
    /// @return validationData 0 for success, 1 for failure
    function validateUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external returns (uint256 validationData);
}
