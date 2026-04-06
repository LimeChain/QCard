// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import "forge-std/Test.sol";
import "../../src/lamport/LamportVerifier.sol";

contract LamportVerifierTest is Test {
    uint256 internal constant LEAF_COUNT = 4;

    LamportVerifier public verifier;

    function setUp() public {
        verifier = new LamportVerifier();
    }

    function test_VerifyValidSignature() public view {
        bytes32 seed = keccak256("test-seed-1");
        (bytes32[512] memory pubKeyHashes, bytes32[512] memory privateKeys) = _generateKeypair(seed);

        bytes32 msgHash = keccak256("hello quantum world");
        bytes32[256] memory signature = _sign(msgHash, privateKeys);

        bool valid = verifier.verify(msgHash, pubKeyHashes, signature);
        assertTrue(valid, "Valid Lamport signature should verify");
    }

    function test_RejectInvalidSignature() public view {
        bytes32 seed = keccak256("test-seed-2");
        (bytes32[512] memory pubKeyHashes, bytes32[512] memory privateKeys) = _generateKeypair(seed);

        bytes32 msgHash = keccak256("hello quantum world");
        bytes32[256] memory signature = _sign(msgHash, privateKeys);
        signature[0] = bytes32(uint256(signature[0]) ^ 1);

        bool valid = verifier.verify(msgHash, pubKeyHashes, signature);
        assertFalse(valid, "Corrupted signature should fail verification");
    }

    function test_RejectWrongMessage() public view {
        bytes32 seed = keccak256("test-seed-3");
        (bytes32[512] memory pubKeyHashes, bytes32[512] memory privateKeys) = _generateKeypair(seed);

        bytes32 msgHash = keccak256("original message");
        bytes32[256] memory signature = _sign(msgHash, privateKeys);

        bytes32 wrongHash = keccak256("different message");
        bool valid = verifier.verify(wrongHash, pubKeyHashes, signature);
        assertFalse(valid, "Signature for wrong message should fail");
    }

    function test_VerifyWithAccountRoot() public view {
        bytes32[LEAF_COUNT] memory leafRoots;
        bytes32[512] memory pubKeyHashes;
        bytes32[512] memory privateKeys;

        for (uint256 leafIndex = 0; leafIndex < LEAF_COUNT; leafIndex++) {
            (bytes32[512] memory leafPubKeyHashes, bytes32[512] memory leafPrivateKeys) =
                _generateKeypair(keccak256(abi.encodePacked("leaf", leafIndex)));
            leafRoots[leafIndex] = _computeLamportRoot(leafPubKeyHashes);

            if (leafIndex == 2) {
                pubKeyHashes = leafPubKeyHashes;
                privateKeys = leafPrivateKeys;
            }
        }

        bytes32 accountRoot = _computeAccountRoot(leafRoots);
        bytes32[] memory proof = _buildProof(leafRoots, 2);
        bytes32 msgHash = keccak256("merkle root test");
        bytes32[256] memory signature = _sign(msgHash, privateKeys);

        bool valid = verifier.verifyWithRoot(msgHash, accountRoot, pubKeyHashes, signature, 2, proof);
        assertTrue(valid, "Valid signature with correct account root should verify");
    }

    function test_RejectWrongMerkleProof() public view {
        bytes32[LEAF_COUNT] memory leafRoots;
        bytes32[512] memory pubKeyHashes;
        bytes32[512] memory privateKeys;

        for (uint256 leafIndex = 0; leafIndex < LEAF_COUNT; leafIndex++) {
            (bytes32[512] memory leafPubKeyHashes, bytes32[512] memory leafPrivateKeys) =
                _generateKeypair(keccak256(abi.encodePacked("leaf", leafIndex)));
            leafRoots[leafIndex] = _computeLamportRoot(leafPubKeyHashes);

            if (leafIndex == 1) {
                pubKeyHashes = leafPubKeyHashes;
                privateKeys = leafPrivateKeys;
            }
        }

        bytes32 accountRoot = _computeAccountRoot(leafRoots);
        bytes32[] memory proof = _buildProof(leafRoots, 1);
        proof[0] = bytes32(uint256(proof[0]) ^ 1);

        bytes32 msgHash = keccak256("merkle root test");
        bytes32[256] memory signature = _sign(msgHash, privateKeys);

        bool valid = verifier.verifyWithRoot(msgHash, accountRoot, pubKeyHashes, signature, 1, proof);
        assertFalse(valid, "Wrong proof should fail");
    }

    function test_RejectWrongLeafIndex() public view {
        bytes32[LEAF_COUNT] memory leafRoots;
        bytes32[512] memory pubKeyHashes;
        bytes32[512] memory privateKeys;

        for (uint256 leafIndex = 0; leafIndex < LEAF_COUNT; leafIndex++) {
            (bytes32[512] memory leafPubKeyHashes, bytes32[512] memory leafPrivateKeys) =
                _generateKeypair(keccak256(abi.encodePacked("leaf", leafIndex)));
            leafRoots[leafIndex] = _computeLamportRoot(leafPubKeyHashes);

            if (leafIndex == 1) {
                pubKeyHashes = leafPubKeyHashes;
                privateKeys = leafPrivateKeys;
            }
        }

        bytes32 accountRoot = _computeAccountRoot(leafRoots);
        bytes32[] memory proof = _buildProof(leafRoots, 1);
        bytes32 msgHash = keccak256("merkle root test");
        bytes32[256] memory signature = _sign(msgHash, privateKeys);

        bool valid = verifier.verifyWithRoot(msgHash, accountRoot, pubKeyHashes, signature, 0, proof);
        assertFalse(valid, "Mismatched leaf index should fail");
    }

    function test_GasCost() public {
        bytes32 seed = keccak256("gas-test");
        (bytes32[512] memory pubKeyHashes, bytes32[512] memory privateKeys) = _generateKeypair(seed);

        bytes32 msgHash = keccak256("measure gas");
        bytes32[256] memory signature = _sign(msgHash, privateKeys);

        uint256 gasBefore = gasleft();
        verifier.verify(msgHash, pubKeyHashes, signature);
        uint256 gasUsed = gasBefore - gasleft();

        emit log_named_uint("Lamport verify gas", gasUsed);
        assertLt(gasUsed, 500_000, "Lamport verification should cost less than 500K gas");
    }

    function _generateKeypair(bytes32 seed)
        internal
        pure
        returns (bytes32[512] memory pubKeyHashes, bytes32[512] memory privateKeys)
    {
        for (uint256 i = 0; i < 512; i++) {
            privateKeys[i] = keccak256(abi.encodePacked(seed, i));
            pubKeyHashes[i] = keccak256(abi.encodePacked(privateKeys[i]));
        }
    }

    function _sign(bytes32 msgHash, bytes32[512] memory privateKeys)
        internal
        pure
        returns (bytes32[256] memory signature)
    {
        for (uint256 i = 0; i < 256; i++) {
            uint256 bit = (uint256(msgHash) >> (255 - i)) & 1;
            signature[i] = privateKeys[2 * i + bit];
        }
    }

    function _computeLamportRoot(bytes32[512] memory leaves) internal pure returns (bytes32) {
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

    function _buildProof(bytes32[LEAF_COUNT] memory leaves, uint256 leafIndex)
        internal
        pure
        returns (bytes32[] memory proof)
    {
        proof = new bytes32[](2);
        bytes32[LEAF_COUNT] memory layer;
        for (uint256 i = 0; i < LEAF_COUNT; i++) {
            layer[i] = leaves[i];
        }
        uint256 idx = leafIndex;
        uint256 n = LEAF_COUNT;
        uint256 proofIndex;

        while (n > 1) {
            uint256 siblingIndex = idx ^ 1;
            proof[proofIndex++] = layer[siblingIndex];

            for (uint256 i = 0; i < n / 2; i++) {
                layer[i] = keccak256(abi.encodePacked(layer[2 * i], layer[2 * i + 1]));
            }

            idx /= 2;
            n /= 2;
        }
    }
}
