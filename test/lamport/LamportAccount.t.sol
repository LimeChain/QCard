// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import "forge-std/Test.sol";
import "../../src/lamport/LamportVerifier.sol";
import "../../src/lamport/LamportAccount.sol";
import "../../src/interfaces/IAccount.sol";

contract LamportAccountTest is Test {
    uint256 internal constant LEAF_COUNT = 4;

    LamportVerifier public verifier;
    LamportAccount public account;

    bytes32 internal constant MASTER_SEED = keccak256("lamport-account-test");
    address internal constant OWNER = address(0xBEEF);

    bytes32[512][LEAF_COUNT] internal pubKeyHashesByLeaf;
    bytes32[512][LEAF_COUNT] internal privateKeysByLeaf;
    bytes32[LEAF_COUNT] internal leafRoots;
    bytes32 internal accountRoot;

    function setUp() public {
        verifier = new LamportVerifier();

        for (uint256 leafIndex = 0; leafIndex < LEAF_COUNT; leafIndex++) {
            bytes32 leafSeed = keccak256(abi.encodePacked(MASTER_SEED, leafIndex));
            for (uint256 i = 0; i < 512; i++) {
                privateKeysByLeaf[leafIndex][i] = keccak256(abi.encodePacked(leafSeed, i));
                pubKeyHashesByLeaf[leafIndex][i] = keccak256(abi.encodePacked(privateKeysByLeaf[leafIndex][i]));
            }
            leafRoots[leafIndex] = _computeLamportRoot(pubKeyHashesByLeaf[leafIndex]);
        }

        accountRoot = _computeAccountRoot(leafRoots);
        account = new LamportAccount(address(verifier), accountRoot, address(this), OWNER);
        vm.deal(address(account), 10 ether);
    }

    function test_ValidateUserOp_ValidSignature() public {
        bytes32 userOpHash = keccak256("test-user-op");
        UserOperation memory userOp = _buildUserOp(_buildSignaturePayload(userOpHash, 0), 0);

        uint256 result = account.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, 0, "Valid signature should return 0");
        assertEq(account.nextKeyIndex(), 1, "Key index should increment");
        assertEq(account.nonce(), 1, "Nonce should increment");
    }

    function test_ValidateUserOp_InvalidSignature() public {
        bytes32 userOpHash = keccak256("test-user-op");
        bytes memory payload = _buildSignaturePayload(userOpHash, 0);
        (bytes32[512] memory pubKeyHashes, bytes32[256] memory sig, uint256 leafIndex, bytes32[] memory proof) =
            abi.decode(payload, (bytes32[512], bytes32[256], uint256, bytes32[]));
        sig[0] = bytes32(uint256(sig[0]) ^ 1);

        UserOperation memory userOp = _buildUserOp(abi.encode(pubKeyHashes, sig, leafIndex, proof), 0);

        uint256 result = account.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, 1, "Invalid signature should return 1");
        assertEq(account.nextKeyIndex(), 0, "Key index should NOT increment on failure");
        assertEq(account.nonce(), 0, "Nonce should NOT increment on failure");
    }

    function test_ValidateUserOp_RejectsReplay() public {
        bytes32 userOpHash = keccak256("test-user-op");
        UserOperation memory userOp = _buildUserOp(_buildSignaturePayload(userOpHash, 0), 0);
        uint256 balanceBefore = address(this).balance;

        uint256 firstResult = account.validateUserOp(userOp, userOpHash, 0.1 ether);
        uint256 secondResult = account.validateUserOp(userOp, userOpHash, 0.1 ether);

        assertEq(firstResult, 0, "First validation should pass");
        assertEq(secondResult, 1, "Replay should fail once nonce advances");
        assertEq(account.nextKeyIndex(), 1, "Only one key should be consumed");
        assertEq(account.nonce(), 1, "Only one nonce should be consumed");
        assertEq(address(this).balance - balanceBefore, 0.1 ether, "EntryPoint should only receive one prefund payment");
    }

    function test_ValidateUserOp_RejectsWrongLeafIndex() public {
        bytes32 userOpHash = keccak256("test-user-op");
        UserOperation memory userOp = _buildUserOp(_buildSignaturePayload(userOpHash, 1), 0);

        uint256 result = account.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, 1, "Wrong Lamport leaf should fail");
        assertEq(account.nextKeyIndex(), 0, "Key index should stay unchanged");
    }

    function test_ValidateUserOp_RejectsWrongNonce() public {
        bytes32 userOpHash = keccak256("test-user-op");
        UserOperation memory userOp = _buildUserOp(_buildSignaturePayload(userOpHash, 0), 3);

        uint256 result = account.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, 1, "Wrong nonce should fail");
    }

    function test_ValidateUserOp_RevertsForNonEntryPoint() public {
        bytes32 userOpHash = keccak256("test-user-op");
        UserOperation memory userOp = _buildUserOp(_buildSignaturePayload(userOpHash, 0), 0);

        vm.prank(address(0xCAFE));
        vm.expectRevert(LamportAccount.OnlyEntryPoint.selector);
        account.validateUserOp(userOp, userOpHash, 0);
    }

    function test_Execute_AsOwner() public {
        address recipient = address(0xCAFE);

        vm.prank(OWNER);
        account.execute(recipient, 1 ether, "");
        assertEq(recipient.balance, 1 ether, "Owner should be able to execute");
    }

    function test_Execute_AsEntryPoint() public {
        address recipient = address(0xCAFE);

        account.execute(recipient, 1 ether, "");
        assertEq(recipient.balance, 1 ether, "EntryPoint should be able to execute");
    }

    function test_UpdateKeyRoot() public {
        bytes32 newRoot = keccak256("new-key-root");

        vm.prank(OWNER);
        account.updateKeyRoot(newRoot);

        assertEq(account.publicKeyRoot(), newRoot, "Root should be updated");
        assertEq(account.nextKeyIndex(), 0, "Key index should reset");
        assertEq(account.nonce(), 0, "Nonce should stay unchanged");
    }

    function test_UpdateKeyRoot_OnlyOwner() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(LamportAccount.OnlyOwner.selector);
        account.updateKeyRoot(keccak256("new-key-root"));
    }

    function test_GasCost_ValidateUserOp() public {
        bytes32 userOpHash = keccak256("gas-test-op");
        UserOperation memory userOp = _buildUserOp(_buildSignaturePayload(userOpHash, 0), 0);

        uint256 gasBefore = gasleft();
        account.validateUserOp(userOp, userOpHash, 0);
        uint256 gasUsed = gasBefore - gasleft();

        emit log_named_uint("LamportAccount validateUserOp gas", gasUsed);
        assertLt(gasUsed, 3_500_000, "Should stay under 3.5M gas");
    }

    function _buildSignaturePayload(bytes32 msgHash, uint256 leafIndex) internal view returns (bytes memory) {
        bytes32[512] memory pubKeyHashes = _copyFixedArray(pubKeyHashesByLeaf[leafIndex]);
        bytes32[512] memory privateKeys = _copyFixedArray(privateKeysByLeaf[leafIndex]);
        bytes32[256] memory signature = _sign(msgHash, privateKeys);
        bytes32[] memory proof = _buildProof(leafIndex);
        return abi.encode(pubKeyHashes, signature, leafIndex, proof);
    }

    function _buildUserOp(bytes memory sig, uint256 userNonce) internal view returns (UserOperation memory) {
        return UserOperation({
            sender: address(account),
            nonce: userNonce,
            callData: "",
            callGasLimit: 100000,
            verificationGasLimit: 3500000,
            preVerificationGas: 50000,
            maxFeePerGas: 1 gwei,
            maxPriorityFeePerGas: 1 gwei,
            signature: sig
        });
    }

    function _sign(bytes32 msgHash, bytes32[512] memory keys)
        internal
        pure
        returns (bytes32[256] memory signature)
    {
        for (uint256 i = 0; i < 256; i++) {
            uint256 bit = (uint256(msgHash) >> (255 - i)) & 1;
            signature[i] = keys[2 * i + bit];
        }
    }

    function _copyFixedArray(bytes32[512] storage source) internal view returns (bytes32[512] memory target) {
        for (uint256 i = 0; i < 512; i++) {
            target[i] = source[i];
        }
    }

    function _computeLamportRoot(bytes32[512] storage leaves) internal view returns (bytes32) {
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

    function _computeAccountRoot(bytes32[LEAF_COUNT] memory leaves) internal pure returns (bytes32) {
        bytes32[LEAF_COUNT] memory layer;
        for (uint256 i = 0; i < LEAF_COUNT; i++) {
            layer[i] = leaves[i];
        }
        uint256 n = LEAF_COUNT;

        while (n > 1) {
            for (uint256 i = 0; i < n / 2; i++) {
                layer[i] = keccak256(abi.encodePacked(layer[2 * i], layer[2 * i + 1]));
            }
            n /= 2;
        }

        return layer[0];
    }

    function _buildProof(uint256 leafIndex) internal view returns (bytes32[] memory proof) {
        proof = new bytes32[](2);
        bytes32[LEAF_COUNT] memory layer = leafRoots;
        uint256 idx = leafIndex;
        uint256 n = LEAF_COUNT;
        uint256 proofIndex;

        while (n > 1) {
            proof[proofIndex++] = layer[idx ^ 1];
            for (uint256 i = 0; i < n / 2; i++) {
                layer[i] = keccak256(abi.encodePacked(layer[2 * i], layer[2 * i + 1]));
            }
            idx /= 2;
            n /= 2;
        }
    }

    receive() external payable {}
}
