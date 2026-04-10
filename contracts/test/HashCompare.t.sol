// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Test, console} from "forge-std/Test.sol";
import {UserOperation} from "../src/interfaces/IAccount.sol";

interface IEntryPoint {
    function getUserOpHash(UserOperation calldata userOp) external view returns (bytes32);
}

/// @notice Verify that our JS-side packUserOp produces the same hash as
///         the real EntryPoint.getUserOpHash(). If they differ, signatures
///         computed in the browser will never match, causing AA24.
///
/// Run with: forge test --fork-url $SEPOLIA_RPC_URL --match-contract HashCompareTest --via-ir
contract HashCompareTest is Test {
    IEntryPoint constant ENTRY_POINT = IEntryPoint(0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789);

    function test_HashMatchesEntryPoint() public view {
        string memory rpc = vm.envOr("SEPOLIA_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;

        UserOperation memory op = UserOperation({
            sender: address(0x1234),
            nonce: 42,
            initCode: "",
            callData: hex"deadbeef",
            callGasLimit: 500000,
            verificationGasLimit: 3000000,
            preVerificationGas: 100000,
            maxFeePerGas: 10 gwei,
            maxPriorityFeePerGas: 1 gwei,
            paymasterAndData: "",
            signature: ""
        });

        // EntryPoint's hash
        bytes32 epHash = ENTRY_POINT.getUserOpHash(op);

        // Our JS-equivalent hash: keccak256(abi.encode(keccak256(packed), entryPoint, chainId))
        bytes32 packed = keccak256(abi.encode(
            op.sender,
            op.nonce,
            keccak256(op.initCode),
            keccak256(op.callData),
            op.callGasLimit,
            op.verificationGasLimit,
            op.preVerificationGas,
            op.maxFeePerGas,
            op.maxPriorityFeePerGas,
            keccak256(op.paymasterAndData)
        ));
        bytes32 ourHash = keccak256(abi.encode(packed, address(ENTRY_POINT), block.chainid));

        console.log("EntryPoint hash:");
        console.logBytes32(epHash);
        console.log("Our computed hash:");
        console.logBytes32(ourHash);
        assertEq(ourHash, epHash, "hash must match EntryPoint");
    }
}
