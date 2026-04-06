// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import "../../src/lamport/LamportVerifier.sol";

contract LamportVerifierTest is Test {
    LamportVerifier public verifier;

    function setUp() public {
        verifier = new LamportVerifier();
    }

    /// @notice Generate a deterministic Lamport keypair from a seed
    /// @dev In production, use a CSPRNG. This is deterministic for reproducible tests.
    function _generateKeypair(bytes32 seed)
        internal
        pure
        returns (bytes32[512] memory pubKeyHashes, bytes32[512] memory privateKeys)
    {
        for (uint256 i = 0; i < 512; i++) {
            // Derive private key material deterministically
            privateKeys[i] = keccak256(abi.encodePacked(seed, i));
            // Public key is the hash of each private key value
            pubKeyHashes[i] = keccak256(abi.encodePacked(privateKeys[i]));
        }
    }

    /// @notice Sign a message hash using a Lamport private key
    function _sign(bytes32 msgHash, bytes32[512] memory privateKeys)
        internal
        pure
        returns (bytes32[256] memory signature)
    {
        for (uint256 i = 0; i < 256; i++) {
            uint256 bit = (uint256(msgHash) >> (255 - i)) & 1;
            // Reveal left (bit=0) or right (bit=1) preimage
            signature[i] = privateKeys[2 * i + bit];
        }
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

        // Corrupt one preimage
        signature[0] = bytes32(uint256(signature[0]) ^ 1);

        bool valid = verifier.verify(msgHash, pubKeyHashes, signature);
        assertFalse(valid, "Corrupted signature should fail verification");
    }

    function test_RejectWrongMessage() public view {
        bytes32 seed = keccak256("test-seed-3");
        (bytes32[512] memory pubKeyHashes, bytes32[512] memory privateKeys) = _generateKeypair(seed);

        bytes32 msgHash = keccak256("original message");
        bytes32[256] memory signature = _sign(msgHash, privateKeys);

        // Verify against a different message
        bytes32 wrongHash = keccak256("different message");
        bool valid = verifier.verify(wrongHash, pubKeyHashes, signature);
        assertFalse(valid, "Signature for wrong message should fail");
    }

    function test_VerifyWithMerkleRoot() public view {
        bytes32 seed = keccak256("test-seed-4");
        (bytes32[512] memory pubKeyHashes, bytes32[512] memory privateKeys) = _generateKeypair(seed);

        bytes32 msgHash = keccak256("merkle root test");
        bytes32[256] memory signature = _sign(msgHash, privateKeys);

        // Compute the expected Merkle root
        bytes32 root = _computeRoot(pubKeyHashes);

        bool valid = verifier.verifyWithRoot(msgHash, root, pubKeyHashes, signature);
        assertTrue(valid, "Valid signature with correct Merkle root should verify");
    }

    function test_RejectWrongMerkleRoot() public view {
        bytes32 seed = keccak256("test-seed-5");
        (bytes32[512] memory pubKeyHashes, bytes32[512] memory privateKeys) = _generateKeypair(seed);

        bytes32 msgHash = keccak256("merkle root test");
        bytes32[256] memory signature = _sign(msgHash, privateKeys);

        // Use a wrong root
        bytes32 wrongRoot = keccak256("wrong root");

        bool valid = verifier.verifyWithRoot(msgHash, wrongRoot, pubKeyHashes, signature);
        assertFalse(valid, "Wrong Merkle root should fail");
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
        // Should be under 500K gas
        assertLt(gasUsed, 500_000, "Lamport verification should cost less than 500K gas");
    }

    /// @dev Mirror the contract's Merkle root computation for test assertions
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
