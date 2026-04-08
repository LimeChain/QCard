// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Test} from "forge-std/Test.sol";
import {HCAAccount} from "../src/HCAAccount.sol";
import {LamportVerifier} from "../src/verifiers/LamportVerifier.sol";
import {ECDSAVerifier} from "../src/verifiers/ECDSAVerifier.sol";
import {UserOperation} from "../src/interfaces/IAccount.sol";

contract HCAAccountTest is Test {
    uint256 internal constant LEAF_COUNT = 4;
    uint8 internal constant VERSION_LAMPORT = 0x01;
    uint8 internal constant VERSION_ECDSA = 0x03;

    LamportVerifier public lamportVerifier;
    ECDSAVerifier public ecdsaVerifier;
    HCAAccount public account;

    bytes32 internal constant MASTER_SEED = keccak256("hca-account-test");
    address internal constant OWNER = address(0xBEEF);

    // Per-leaf Lamport keys (only leaves 0-2 are Lamport, leaf 3 is ECDSA)
    bytes32[512][3] internal pubKeyHashesByLeaf;
    bytes32[512][3] internal privateKeysByLeaf;

    // ECDSA leaf (leaf index 3)
    uint256 internal ecdsaPrivateKey = 0xA11CE;
    address internal ecdsaSigner;

    // Leaf hashes for the auth tree
    bytes32[LEAF_COUNT] internal leafHashes;
    bytes32 internal authRoot;

    function setUp() public {
        lamportVerifier = new LamportVerifier();
        ecdsaVerifier = new ECDSAVerifier();
        ecdsaSigner = vm.addr(ecdsaPrivateKey);

        // Generate Lamport keys for leaves 0-2
        for (uint256 leafIdx = 0; leafIdx < 3; leafIdx++) {
            bytes32 leafSeed = keccak256(abi.encodePacked(MASTER_SEED, leafIdx));
            for (uint256 i = 0; i < 512; i++) {
                privateKeysByLeaf[leafIdx][i] = keccak256(abi.encodePacked(leafSeed, i));
                pubKeyHashesByLeaf[leafIdx][i] = keccak256(abi.encodePacked(privateKeysByLeaf[leafIdx][i]));
            }

            // Leaf commitment = public key hashes (committed at tree-build time)
            // Leaf hash = keccak256(version || keccak256(commitment))
            bytes memory pubKeyData = abi.encode(pubKeyHashesByLeaf[leafIdx]);
            leafHashes[leafIdx] = keccak256(abi.encodePacked(VERSION_LAMPORT, keccak256(pubKeyData)));
        }

        // ECDSA leaf (leaf index 3): commitment = abi.encode(ecdsaSigner)
        bytes memory ecdsaPubData = abi.encode(ecdsaSigner);
        leafHashes[3] = keccak256(abi.encodePacked(VERSION_ECDSA, keccak256(ecdsaPubData)));

        authRoot = _computeAuthRoot(leafHashes);

        uint8[] memory versions = new uint8[](2);
        address[] memory verifierAddrs = new address[](2);
        versions[0] = VERSION_LAMPORT;
        verifierAddrs[0] = address(lamportVerifier);
        versions[1] = VERSION_ECDSA;
        verifierAddrs[1] = address(ecdsaVerifier);

        // The test contract acts as the EntryPoint
        account = new HCAAccount(authRoot, address(this), OWNER, versions, verifierAddrs);
        vm.deal(address(account), 10 ether);
    }

    // ---------------------------------------------------------------
    // Lamport leaf validation
    // ---------------------------------------------------------------

    function test_ValidLamportLeaf() public {
        bytes32 userOpHash = keccak256("test-lamport-op");
        uint256 leafIdx = 0;

        bytes memory commitment = _lamportCommitment(leafIdx);
        bytes memory sigData = _buildLamportSigData(userOpHash, leafIdx);
        bytes32[] memory proof = _buildProof(leafIdx);

        bytes memory signature = abi.encode(VERSION_LAMPORT, leafIdx, proof, commitment, sigData);
        UserOperation memory userOp = _buildUserOp(signature, 0);

        uint256 result = account.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, 0, "Valid Lamport leaf should pass");
        assertEq(account.nonce(), 1, "Nonce should increment");
    }

    function test_InvalidLamportSig() public {
        bytes32 userOpHash = keccak256("test-lamport-invalid");
        uint256 leafIdx = 0;

        bytes memory sigData = _buildLamportSigData(userOpHash, leafIdx);

        // Corrupt the signature
        (bytes32[512] memory pubKeys, bytes32[256] memory lamportSig) =
            abi.decode(sigData, (bytes32[512], bytes32[256]));
        lamportSig[0] = bytes32(uint256(lamportSig[0]) ^ 1);
        sigData = abi.encode(pubKeys, lamportSig);

        bytes memory commitment = _lamportCommitment(leafIdx);
        bytes32[] memory proof = _buildProof(leafIdx);
        bytes memory signature = abi.encode(VERSION_LAMPORT, leafIdx, proof, commitment, sigData);
        UserOperation memory userOp = _buildUserOp(signature, 0);

        uint256 result = account.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, 1, "Corrupted Lamport sig should fail");
        assertEq(account.nonce(), 0, "Nonce should NOT increment on failure");
    }

    function test_WrongLeafIndex_MerkleFailure() public {
        bytes32 userOpHash = keccak256("test-wrong-leaf");
        uint256 correctLeafIdx = 0;
        uint256 wrongLeafIdx = 1;

        // Build sigData for leaf 0 but provide proof for leaf 1
        bytes memory commitment = _lamportCommitment(correctLeafIdx);
        bytes memory sigData = _buildLamportSigData(userOpHash, correctLeafIdx);
        bytes32[] memory proof = _buildProof(wrongLeafIdx);

        bytes memory signature = abi.encode(VERSION_LAMPORT, wrongLeafIdx, proof, commitment, sigData);
        UserOperation memory userOp = _buildUserOp(signature, 0);

        uint256 result = account.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, 1, "Wrong leaf index should fail Merkle check");
    }

    // ---------------------------------------------------------------
    // ECDSA leaf validation
    // ---------------------------------------------------------------

    function test_ValidECDSALeaf() public {
        bytes32 userOpHash = keccak256("test-ecdsa-op");

        // ECDSA commitment is the signer address (committed at tree-build time)
        bytes memory commitment = abi.encode(ecdsaSigner);
        // sigData includes both the signer and the actual ECDSA signature
        bytes memory sigData = _buildECDSASigData(userOpHash);

        // Use the main account (leaf 3 is already ECDSA in the auth tree)
        bytes32[] memory proof = _buildProof(3);
        bytes memory signature = abi.encode(VERSION_ECDSA, uint256(3), proof, commitment, sigData);
        UserOperation memory userOp = _buildUserOp(signature, 0);

        uint256 result = account.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, 0, "Valid ECDSA leaf should pass");
    }

    // ---------------------------------------------------------------
    // Nonce enforcement
    // ---------------------------------------------------------------

    function test_RejectsWrongNonce() public {
        bytes32 userOpHash = keccak256("test-nonce");

        bytes memory commitment = _lamportCommitment(0);
        bytes memory sigData = _buildLamportSigData(userOpHash, 0);
        bytes32[] memory proof = _buildProof(0);
        bytes memory signature = abi.encode(VERSION_LAMPORT, uint256(0), proof, commitment, sigData);

        UserOperation memory userOp = _buildUserOp(signature, 99);
        uint256 result = account.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, 1, "Wrong nonce should fail");
    }

    function test_RejectsReplay() public {
        bytes32 userOpHash = keccak256("test-replay");

        bytes memory commitment = _lamportCommitment(0);
        bytes memory sigData = _buildLamportSigData(userOpHash, 0);
        bytes32[] memory proof = _buildProof(0);
        bytes memory signature = abi.encode(VERSION_LAMPORT, uint256(0), proof, commitment, sigData);
        UserOperation memory userOp = _buildUserOp(signature, 0);

        uint256 first = account.validateUserOp(userOp, userOpHash, 0);
        uint256 second = account.validateUserOp(userOp, userOpHash, 0);

        assertEq(first, 0, "First should pass");
        assertEq(second, 1, "Replay should fail (nonce mismatch)");
    }

    // ---------------------------------------------------------------
    // Access control
    // ---------------------------------------------------------------

    function test_OnlyEntryPoint() public {
        bytes32 userOpHash = keccak256("test-access");
        bytes memory commitment = _lamportCommitment(0);
        bytes memory sigData = _buildLamportSigData(userOpHash, 0);
        bytes32[] memory proof = _buildProof(0);
        bytes memory signature = abi.encode(VERSION_LAMPORT, uint256(0), proof, commitment, sigData);
        UserOperation memory userOp = _buildUserOp(signature, 0);

        vm.prank(address(0xCAFE));
        vm.expectRevert(HCAAccount.OnlyEntryPoint.selector);
        account.validateUserOp(userOp, userOpHash, 0);
    }

    function test_UnknownVersion() public {
        bytes32 userOpHash = keccak256("test-unknown-ver");
        uint8 badVersion = 0xFF;

        // Build a fake leaf with a commitment that produces a valid Merkle path
        bytes memory fakeCommitment = abi.encode(bytes32(0));
        bytes32 fakeLeaf = keccak256(abi.encodePacked(badVersion, keccak256(fakeCommitment)));

        // Replace leaf 0 with the fake leaf and recompute root
        bytes32[LEAF_COUNT] memory newLeaves;
        newLeaves[0] = fakeLeaf;
        for (uint256 i = 1; i < LEAF_COUNT; i++) {
            newLeaves[i] = leafHashes[i];
        }
        bytes32 newRoot = _computeAuthRoot(newLeaves);

        uint8[] memory versions = new uint8[](2);
        address[] memory verifierAddrs = new address[](2);
        versions[0] = VERSION_LAMPORT;
        verifierAddrs[0] = address(lamportVerifier);
        versions[1] = VERSION_ECDSA;
        verifierAddrs[1] = address(ecdsaVerifier);

        HCAAccount badAccount = new HCAAccount(newRoot, address(this), OWNER, versions, verifierAddrs);

        bytes32[] memory proof = _buildProofFromLeaves(newLeaves, 0);
        // commitment and sigData can differ; commitment is what's in the tree, sigData goes to verifier
        bytes memory fakeSigData = abi.encode(bytes32(0));
        bytes memory signature = abi.encode(badVersion, uint256(0), proof, fakeCommitment, fakeSigData);

        UserOperation memory userOp = UserOperation({
            sender: address(badAccount),
            nonce: 0,
            initCode: "",
            callData: "",
            callGasLimit: 100000,
            verificationGasLimit: 500000,
            preVerificationGas: 50000,
            maxFeePerGas: 1 gwei,
            maxPriorityFeePerGas: 1 gwei,
            paymasterAndData: "",
            signature: signature
        });

        vm.expectRevert(abi.encodeWithSelector(HCAAccount.UnknownVersion.selector, badVersion));
        badAccount.validateUserOp(userOp, userOpHash, 0);
    }

    // ---------------------------------------------------------------
    // Execute
    // ---------------------------------------------------------------

    function test_Execute_AsOwner() public {
        address recipient = address(0xCAFE);
        vm.prank(OWNER);
        account.execute(recipient, 1 ether, "");
        assertEq(recipient.balance, 1 ether);
    }

    function test_Execute_AsEntryPoint() public {
        address recipient = address(0xCAFE);
        account.execute(recipient, 1 ether, "");
        assertEq(recipient.balance, 1 ether);
    }

    function test_Execute_Reverts_Unauthorized() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(HCAAccount.OnlyOwnerOrSelf.selector);
        account.execute(address(0xCAFE), 1 ether, "");
    }

    // ---------------------------------------------------------------
    // Auth root rotation via self-call
    // ---------------------------------------------------------------

    function test_UpdateAuthRoot_ViaSelfCall() public {
        bytes32 newRoot = keccak256("new-auth-root");
        bytes memory callData = abi.encodeCall(HCAAccount.updateAuthRoot, (newRoot));

        // execute as EntryPoint (this contract), targeting self
        account.execute(address(account), 0, callData);
        assertEq(account.authRoot(), newRoot, "Auth root should be updated");
    }

    // ---------------------------------------------------------------
    // Gas benchmark
    // ---------------------------------------------------------------

    function test_GasCost_LamportValidation() public {
        bytes32 userOpHash = keccak256("gas-bench-op");

        bytes memory commitment = _lamportCommitment(0);
        bytes memory sigData = _buildLamportSigData(userOpHash, 0);
        bytes32[] memory proof = _buildProof(0);
        bytes memory signature = abi.encode(VERSION_LAMPORT, uint256(0), proof, commitment, sigData);
        UserOperation memory userOp = _buildUserOp(signature, 0);

        uint256 gasBefore = gasleft();
        account.validateUserOp(userOp, userOpHash, 0);
        uint256 gasUsed = gasBefore - gasleft();

        emit log_named_uint("HCAAccount Lamport validateUserOp gas", gasUsed);
        assertLt(gasUsed, 3_500_000, "Should stay under 3.5M gas");
    }

    // ---------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------

    function _lamportCommitment(uint256 leafIdx) internal view returns (bytes memory) {
        bytes32[512] memory pubKeys = _copyPubKeys(leafIdx);
        return abi.encode(pubKeys);
    }

    function _buildECDSASigData(bytes32 msgHash) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ecdsaPrivateKey, msgHash);
        bytes memory ecdsaSig = abi.encodePacked(r, s, v);
        return abi.encode(ecdsaSigner, ecdsaSig);
    }

    function _buildLamportSigData(bytes32 msgHash, uint256 leafIdx) internal view returns (bytes memory) {
        bytes32[512] memory pubKeys = _copyPubKeys(leafIdx);
        bytes32[256] memory sig = _signLamport(msgHash, leafIdx);
        return abi.encode(pubKeys, sig);
    }

    function _signLamport(bytes32 msgHash, uint256 leafIdx) internal view returns (bytes32[256] memory sig) {
        for (uint256 i = 0; i < 256; i++) {
            uint256 bit = (uint256(msgHash) >> (255 - i)) & 1;
            sig[i] = privateKeysByLeaf[leafIdx][2 * i + bit];
        }
    }

    function _copyPubKeys(uint256 leafIdx) internal view returns (bytes32[512] memory target) {
        for (uint256 i = 0; i < 512; i++) {
            target[i] = pubKeyHashesByLeaf[leafIdx][i];
        }
    }

    function _buildUserOp(bytes memory sig, uint256 userNonce) internal view returns (UserOperation memory) {
        return UserOperation({
            sender: address(account),
            nonce: userNonce,
            initCode: "",
            callData: "",
            callGasLimit: 100000,
            verificationGasLimit: 3500000,
            preVerificationGas: 50000,
            maxFeePerGas: 1 gwei,
            maxPriorityFeePerGas: 1 gwei,
            paymasterAndData: "",
            signature: sig
        });
    }

    function _buildProof(uint256 leafIdx) internal view returns (bytes32[] memory) {
        return _buildProofFromLeaves(leafHashes, leafIdx);
    }

    function _buildProofFromLeaves(bytes32[LEAF_COUNT] memory leaves, uint256 leafIdx)
        internal
        pure
        returns (bytes32[] memory proof)
    {
        proof = new bytes32[](2);
        bytes32[LEAF_COUNT] memory layer;
        for (uint256 j = 0; j < LEAF_COUNT; j++) layer[j] = leaves[j];
        uint256 idx = leafIdx;
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

    function _computeAuthRoot(bytes32[LEAF_COUNT] memory leaves) internal pure returns (bytes32) {
        bytes32[LEAF_COUNT] memory layer;
        for (uint256 j = 0; j < LEAF_COUNT; j++) layer[j] = leaves[j];
        uint256 n = LEAF_COUNT;
        while (n > 1) {
            for (uint256 i = 0; i < n / 2; i++) {
                layer[i] = keccak256(abi.encodePacked(layer[2 * i], layer[2 * i + 1]));
            }
            n /= 2;
        }
        return layer[0];
    }

    receive() external payable {}
}
