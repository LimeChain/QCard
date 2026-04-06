// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import "../../src/lamport/LamportVerifier.sol";
import "../../src/lamport/LamportAccount.sol";
import "../../src/interfaces/IAccount.sol";

contract LamportAccountTest is Test {
    LamportVerifier public verifier;
    LamportAccount public account;

    bytes32 constant SEED = keccak256("lamport-account-test");
    address constant OWNER = address(0xBEEF);

    bytes32[512] pubKeyHashes;
    bytes32[512] privateKeys;
    bytes32 pubKeyRoot;

    function setUp() public {
        verifier = new LamportVerifier();

        // Generate keypair
        for (uint256 i = 0; i < 512; i++) {
            privateKeys[i] = keccak256(abi.encodePacked(SEED, i));
            pubKeyHashes[i] = keccak256(abi.encodePacked(privateKeys[i]));
        }

        // Compute Merkle root
        pubKeyRoot = _computeRoot(pubKeyHashes);

        // Deploy account
        account = new LamportAccount(address(verifier), pubKeyRoot, OWNER);
        vm.deal(address(account), 10 ether);
    }

    function test_ValidateUserOp_ValidSignature() public {
        bytes32 userOpHash = keccak256("test-user-op");
        bytes32[256] memory sig = _sign(userOpHash, privateKeys);

        UserOperation memory userOp = _buildUserOp(
            abi.encode(pubKeyHashes, sig)
        );

        uint256 result = account.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, 0, "Valid signature should return 0");
        assertEq(account.nextKeyIndex(), 1, "Key index should increment");
    }

    function test_ValidateUserOp_InvalidSignature() public {
        bytes32 userOpHash = keccak256("test-user-op");
        bytes32[256] memory sig = _sign(userOpHash, privateKeys);

        // Corrupt signature
        sig[0] = bytes32(uint256(sig[0]) ^ 1);

        UserOperation memory userOp = _buildUserOp(
            abi.encode(pubKeyHashes, sig)
        );

        uint256 result = account.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, 1, "Invalid signature should return 1 (SIG_VALIDATION_FAILED)");
        assertEq(account.nextKeyIndex(), 0, "Key index should NOT increment on failure");
    }

    function test_Execute() public {
        address recipient = address(0xCAFE);
        uint256 amount = 1 ether;

        vm.prank(OWNER);
        account.execute(recipient, amount, "");
        assertEq(recipient.balance, amount, "Recipient should receive ETH");
    }

    function test_UpdateKeyRoot() public {
        bytes32 newRoot = keccak256("new-key-root");

        vm.prank(OWNER);
        account.updateKeyRoot(newRoot);

        assertEq(account.publicKeyRoot(), newRoot, "Root should be updated");
        assertEq(account.nextKeyIndex(), 0, "Key index should reset");
    }

    function test_UpdateKeyRoot_OnlyOwner() public {
        bytes32 newRoot = keccak256("new-key-root");

        vm.prank(address(0xDEAD));
        vm.expectRevert(LamportAccount.OnlyOwner.selector);
        account.updateKeyRoot(newRoot);
    }

    function test_GasCost_ValidateUserOp() public {
        bytes32 userOpHash = keccak256("gas-test-op");
        bytes32[256] memory sig = _sign(userOpHash, privateKeys);

        UserOperation memory userOp = _buildUserOp(
            abi.encode(pubKeyHashes, sig)
        );

        uint256 gasBefore = gasleft();
        account.validateUserOp(userOp, userOpHash, 0);
        uint256 gasUsed = gasBefore - gasleft();

        emit log_named_uint("LamportAccount validateUserOp gas", gasUsed);
        assertLt(gasUsed, 2_000_000, "Should be under 2M gas");
    }

    // --- Helpers ---

    function _sign(bytes32 msgHash, bytes32[512] memory keys)
        internal pure returns (bytes32[256] memory signature)
    {
        for (uint256 i = 0; i < 256; i++) {
            uint256 bit = (uint256(msgHash) >> (255 - i)) & 1;
            signature[i] = keys[2 * i + bit];
        }
    }

    function _buildUserOp(bytes memory sig) internal view returns (UserOperation memory) {
        return UserOperation({
            sender: address(account),
            nonce: 0,
            callData: "",
            callGasLimit: 100000,
            verificationGasLimit: 2000000,
            preVerificationGas: 50000,
            maxFeePerGas: 1 gwei,
            maxPriorityFeePerGas: 1 gwei,
            signature: sig
        });
    }

    function _computeRoot(bytes32[512] memory leaves) internal pure returns (bytes32) {
        bytes32[512] memory layer;
        for (uint256 i = 0; i < 512; i++) {
            layer[i] = leaves[i];
        }
        uint256 n = 512;
        while (n > 1) {
            for (uint256 i = 0; i < n / 2; i++) {
                layer[i] = keccak256(abi.encodePacked(layer[2 * i], layer[2 * i + 1]));
            }
            n /= 2;
        }
        return layer[0];
    }
}
