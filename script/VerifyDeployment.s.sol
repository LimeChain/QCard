// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import "forge-std/Script.sol";
import "../src/lamport/LamportVerifier.sol";
import "../src/factory/PQCAccountFactory.sol";

/// @notice Post-deployment verification — runs against live contracts on Base Sepolia
/// @dev Usage:
///   forge script script/VerifyDeployment.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL -vvvv
///   Env: VERIFIER_ADDRESS, FACTORY_ADDRESS (required), PRIVATE_KEY (optional, for account creation)
contract VerifyDeployment is Script {
    address internal constant DEFAULT_ENTRY_POINT = 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789;

    function run() external {
        address verifierAddr = vm.envAddress("VERIFIER_ADDRESS");
        address factoryAddr = vm.envAddress("FACTORY_ADDRESS");
        address expectedEntryPoint = vm.envOr("ENTRY_POINT_ADDRESS", DEFAULT_ENTRY_POINT);

        console.log("=== Post-Deployment Verification ===");
        console.log("LamportVerifier:", verifierAddr);
        console.log("PQCAccountFactory:", factoryAddr);

        _checkCode(verifierAddr, "LamportVerifier");
        _checkCode(factoryAddr, "PQCAccountFactory");

        _checkFactoryRef(factoryAddr, verifierAddr);
        _checkEntryPoint(factoryAddr, expectedEntryPoint);
        _checkVerify(verifierAddr);

        console.log("=== All checks passed ===");
    }

    function _checkCode(address addr, string memory name) internal view {
        uint256 sz;
        assembly { sz := extcodesize(addr) }
        require(sz > 0, string.concat(name, " has no code!"));
        console.log("PASS:", name, "deployed, code size:", sz);
    }

    function _checkFactoryRef(address factoryAddr, address verifierAddr) internal view {
        PQCAccountFactory factory = PQCAccountFactory(factoryAddr);
        address stored = address(factory.lamportVerifier());
        require(stored == verifierAddr, "Factory points to wrong verifier");
        console.log("PASS: Factory references correct LamportVerifier");
    }

    function _checkEntryPoint(address factoryAddr, address expectedEntryPoint) internal view {
        PQCAccountFactory factory = PQCAccountFactory(factoryAddr);
        require(factory.entryPoint() == expectedEntryPoint, "Factory points to wrong EntryPoint");
        console.log("PASS: Factory references correct EntryPoint");
    }

    function _checkVerify(address verifierAddr) internal view {
        LamportVerifier verifier = LamportVerifier(verifierAddr);

        // Generate deterministic test keypair
        bytes32[512] memory pubKeyHashes;
        bytes32[512] memory privateKeys;
        bytes32 seed = keccak256("verify-deployment-test");
        for (uint256 i = 0; i < 512; i++) {
            privateKeys[i] = keccak256(abi.encodePacked(seed, i));
            pubKeyHashes[i] = keccak256(abi.encodePacked(privateKeys[i]));
        }

        // Sign a test message
        bytes32 msgHash = keccak256("deployment-verification");
        bytes32[256] memory sig;
        for (uint256 i = 0; i < 256; i++) {
            uint256 bit = (uint256(msgHash) >> (255 - i)) & 1;
            sig[i] = privateKeys[2 * i + bit];
        }

        // Verify on-chain
        uint256 g = gasleft();
        bool valid = verifier.verify(msgHash, pubKeyHashes, sig);
        uint256 gasUsed = g - gasleft();

        require(valid, "Lamport verification FAILED!");
        console.log("PASS: Lamport signature verified on-chain");
        console.log("Verification gas:", gasUsed);
    }
}
