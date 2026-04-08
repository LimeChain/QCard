// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Test, console} from "forge-std/Test.sol";
import {HCAAccount} from "../src/HCAAccount.sol";
import {LamportVerifier} from "../src/verifiers/LamportVerifier.sol";
import {IAccount, UserOperation} from "../src/interfaces/IAccount.sol";

/// @notice Debug the AA23 revert: is sigData encoding the root cause?
contract DebugValidation is Test {
    address constant ENTRY_POINT = 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789;

    /// @notice Test: abi.encode(fixed-size) != abi.encode(dynamic) for arrays
    function test_EncodingDifference() public pure {
        bytes32[2] memory fixedArr;
        fixedArr[0] = bytes32(uint256(1));
        fixedArr[1] = bytes32(uint256(2));

        bytes32[] memory dynArr = new bytes32[](2);
        dynArr[0] = bytes32(uint256(1));
        dynArr[1] = bytes32(uint256(2));

        bytes memory fixedEncoded = abi.encode(fixedArr);
        bytes memory dynEncoded = abi.encode(dynArr);

        // Fixed: 64 bytes (just 2 * 32)
        // Dynamic: 128 bytes (offset(32) + length(32) + 2 * 32)
        assertEq(fixedEncoded.length, 64, "fixed should be 64 bytes");
        assertEq(dynEncoded.length, 128, "dynamic should be 128 bytes");
        assertTrue(keccak256(fixedEncoded) != keccak256(dynEncoded), "encodings must differ");
    }

    /// @notice Full E2E test with correct sigData encoding
    function test_MinimalE2E() public {
        LamportVerifier lamport = new LamportVerifier();
        bytes32 masterSeed = keccak256("debug-seed");
        bytes32 leafSeed = keccak256(abi.encodePacked(masterSeed, uint256(0)));

        // Generate 512 keys
        bytes32[] memory pubKeyHashes = new bytes32[](512);
        bytes32[] memory privateKeys = new bytes32[](512);
        for (uint256 i = 0; i < 512; i++) {
            privateKeys[i] = keccak256(abi.encodePacked(leafSeed, i));
            pubKeyHashes[i] = keccak256(abi.encodePacked(privateKeys[i]));
        }

        // Build commitment: raw concatenation of pubKeyHashes (16384 bytes)
        bytes memory commitment = _concatHashes(pubKeyHashes);

        // Leaf hash: keccak256(abi.encodePacked(version, keccak256(commitment)))
        bytes32 leafHash = keccak256(abi.encodePacked(uint8(1), keccak256(commitment)));

        // Leaf 1 (dummy)
        bytes32 leaf1Hash = _buildDummyLeafHash(masterSeed, 1);

        // Auth root = keccak256(leaf0 || leaf1)
        bytes32 authRoot = keccak256(abi.encodePacked(leafHash, leaf1Hash));

        // Deploy account
        HCAAccount account = _deployAccount(authRoot, address(lamport));

        // Sign message
        bytes32 msgHash = keccak256("test-msg");
        bytes32[] memory sig = _signLamport(privateKeys, msgHash);

        // CRITICAL FIX: sigData must be encoded as fixed-size arrays
        // abi.encode(bytes32[512], bytes32[256]) = raw concatenation, no offsets/lengths
        // abi.encode(bytes32[], bytes32[]) = with offsets+lengths = WRONG for decode
        bytes memory sigData = _encodeSigDataFixed(pubKeyHashes, sig);

        // Proof for leaf 0 in 2-leaf tree: [leaf1Hash]
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = leaf1Hash;

        // Full 5-field signature
        bytes memory fullSig = abi.encode(uint8(1), uint256(0), proof, commitment, sigData);

        UserOperation memory userOp = UserOperation({
            sender: address(account),
            nonce: 0,
            initCode: "",
            callData: "",
            callGasLimit: 500000,
            verificationGasLimit: 5000000,
            preVerificationGas: 100000,
            maxFeePerGas: 1 gwei,
            maxPriorityFeePerGas: 1 gwei,
            paymasterAndData: "",
            signature: fullSig
        });

        vm.prank(ENTRY_POINT);
        uint256 result = account.validateUserOp(userOp, msgHash, 0);
        assertEq(result, 0, "validateUserOp should succeed");
    }

    // --- Helpers to avoid stack-too-deep ---

    function _concatHashes(bytes32[] memory arr) internal pure returns (bytes memory) {
        bytes memory result = new bytes(arr.length * 32);
        for (uint256 i = 0; i < arr.length; i++) {
            assembly {
                mstore(add(add(result, 32), mul(i, 32)), mload(add(add(arr, 32), mul(i, 32))))
            }
        }
        return result;
    }

    function _buildDummyLeafHash(bytes32 masterSeed, uint256 leafIdx) internal pure returns (bytes32) {
        bytes32 dummySeed = keccak256(abi.encodePacked(masterSeed, leafIdx));
        bytes32[] memory dummyPubKeys = new bytes32[](512);
        for (uint256 i = 0; i < 512; i++) {
            bytes32 pk = keccak256(abi.encodePacked(dummySeed, i));
            dummyPubKeys[i] = keccak256(abi.encodePacked(pk));
        }
        bytes memory dummyCommitment = _concatHashes(dummyPubKeys);
        return keccak256(abi.encodePacked(uint8(1), keccak256(dummyCommitment)));
    }

    function _deployAccount(bytes32 authRoot, address lamportAddr) internal returns (HCAAccount) {
        uint8[] memory versions = new uint8[](1);
        versions[0] = 1;
        address[] memory verifierAddrs = new address[](1);
        verifierAddrs[0] = lamportAddr;
        HCAAccount account = new HCAAccount(authRoot, ENTRY_POINT, address(this), versions, verifierAddrs);
        vm.deal(address(account), 1 ether);
        return account;
    }

    function _signLamport(bytes32[] memory privateKeys, bytes32 msgHash) internal pure returns (bytes32[] memory) {
        bytes32[] memory sig = new bytes32[](256);
        for (uint256 i = 0; i < 256; i++) {
            uint256 bit = (uint256(msgHash) >> (255 - i)) & 1;
            sig[i] = privateKeys[2 * i + bit];
        }
        return sig;
    }

    /// @notice Encode sigData as abi.encode(bytes32[512], bytes32[256]) — fixed-size arrays.
    ///         Raw concatenation: 512*32 + 256*32 = 24576 bytes. No offsets or lengths.
    function _encodeSigDataFixed(bytes32[] memory pks, bytes32[] memory sigs) internal pure returns (bytes memory) {
        require(pks.length == 512, "pks must be 512");
        require(sigs.length == 256, "sigs must be 256");
        bytes memory result = new bytes(768 * 32); // 512 + 256
        // Copy pubKeyHashes
        for (uint256 i = 0; i < 512; i++) {
            assembly {
                mstore(add(add(result, 32), mul(i, 32)), mload(add(add(pks, 32), mul(i, 32))))
            }
        }
        // Copy sig
        for (uint256 i = 0; i < 256; i++) {
            assembly {
                mstore(add(add(result, 32), mul(add(512, i), 32)), mload(add(add(sigs, 32), mul(i, 32))))
            }
        }
        return result;
    }
}
