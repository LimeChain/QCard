// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

/// @title LamportVerifier — Quantum-resistant signature verification using only keccak256
/// @notice Lamport one-time signatures: the simplest post-quantum scheme.
///         Security relies solely on hash preimage resistance — no lattices, no curves.
///
/// How it works:
///   Key generation: Generate 256 pairs of random 32-byte values. Hash each → 512 hashes = public key.
///   Signing: For each bit of the message hash, reveal the left or right preimage from that pair.
///   Verification: Hash each revealed preimage and compare against the stored public key hash.
///
/// Gas cost: ~300K (256 keccak256 ops + calldata for 256 x 32-byte preimages)
contract LamportVerifier {
    /// @notice Verify a Lamport signature against a public key
    /// @param msgHash The 32-byte hash of the message being verified
    /// @param pubKeyHashes The 512 hashes that form the public key [pair0_left, pair0_right, pair1_left, ...]
    /// @param signature The 256 revealed preimages (one per bit of msgHash)
    /// @return valid True if the signature is valid
    function verify(
        bytes32 msgHash,
        bytes32[512] calldata pubKeyHashes,
        bytes32[256] calldata signature
    ) external pure returns (bool valid) {
        for (uint256 i = 0; i < 256; i++) {
            // Extract bit i from the message hash
            uint256 bit = (uint256(msgHash) >> (255 - i)) & 1;

            // The signer revealed the preimage for the left (bit=0) or right (bit=1) hash
            // Compute the hash of the revealed preimage
            bytes32 computed = keccak256(abi.encodePacked(signature[i]));

            // Compare against the correct public key hash
            // pubKeyHashes[2*i] = hash of left value, pubKeyHashes[2*i+1] = hash of right value
            bytes32 expected = pubKeyHashes[2 * i + bit];

            if (computed != expected) {
                return false;
            }
        }
        return true;
    }

    /// @notice Verify using an account-level Merkle root instead of the full 512-hash public key
    /// @dev The Lamport public key hashes are first compressed into a leaf root, then checked against the account root
    /// @param msgHash Message hash to verify
    /// @param accountRoot Merkle root of all Lamport leaf roots registered on the account
    /// @param pubKeyHashes Full 512 public key hashes (verified against root)
    /// @param signature The 256 revealed preimages
    /// @param leafIndex Index of the Lamport leaf within the account-level Merkle tree
    /// @param merkleProof Sibling hashes proving the Lamport leaf against `accountRoot`
    /// @return valid True if both the Merkle root matches and the signature is valid
    function verifyWithRoot(
        bytes32 msgHash,
        bytes32 accountRoot,
        bytes32[512] calldata pubKeyHashes,
        bytes32[256] calldata signature,
        uint256 leafIndex,
        bytes32[] calldata merkleProof
    ) external pure returns (bool valid) {
        bytes32 lamportRoot = _computeMerkleRoot(pubKeyHashes);
        if (!_verifyProof(lamportRoot, leafIndex, merkleProof, accountRoot)) {
            return false;
        }

        for (uint256 i = 0; i < 256; i++) {
            uint256 bit = (uint256(msgHash) >> (255 - i)) & 1;
            bytes32 computed = keccak256(abi.encodePacked(signature[i]));
            bytes32 expected = pubKeyHashes[2 * i + bit];
            if (computed != expected) {
                return false;
            }
        }
        return true;
    }

    /// @notice Compute the Merkle root of the 512 Lamport public key hashes
    function _computeMerkleRoot(bytes32[512] calldata leaves) internal pure returns (bytes32) {
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

    function _verifyProof(
        bytes32 leaf,
        uint256 leafIndex,
        bytes32[] calldata merkleProof,
        bytes32 expectedRoot
    ) internal pure returns (bool) {
        bytes32 computed = leaf;
        uint256 idx = leafIndex;

        for (uint256 i = 0; i < merkleProof.length; i++) {
            bytes32 sibling = merkleProof[i];
            if ((idx & 1) == 0) {
                computed = keccak256(abi.encodePacked(computed, sibling));
            } else {
                computed = keccak256(abi.encodePacked(sibling, computed));
            }
            idx >>= 1;
        }

        return computed == expectedRoot;
    }
}
