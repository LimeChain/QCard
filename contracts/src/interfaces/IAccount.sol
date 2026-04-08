// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

/// @title Minimal ERC-4337 Account Interface
struct UserOperation {
    address sender;
    uint256 nonce;
    bytes callData;
    uint256 callGasLimit;
    uint256 verificationGasLimit;
    uint256 preVerificationGas;
    uint256 maxFeePerGas;
    uint256 maxPriorityFeePerGas;
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
