// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import "forge-std/Script.sol";
import "../src/lamport/LamportVerifier.sol";
import "../src/factory/PQCAccountFactory.sol";

/// @notice Deploy the full PQC account stack to Base Sepolia
/// @dev Run: forge script script/DeployFactory.s.sol --rpc-url base_sepolia --broadcast
///
/// Prerequisites:
///   - Set PRIVATE_KEY env var
///   - Set BASE_SEPOLIA_RPC_URL in .env
///   - Set FALCON_VERIFIER_ADDRESS env var (address of deployed ETHFALCON verifier)
///     If not set, deploys without Falcon support (Lamport only)
contract DeployFactory is Script {
    address internal constant DEFAULT_ENTRY_POINT = 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Lamport Verifier
        LamportVerifier lamportVerifier = new LamportVerifier();
        console.log("LamportVerifier:", address(lamportVerifier));

        // 2. Get or skip Falcon verifier address
        address falconVerifier = vm.envOr("FALCON_VERIFIER_ADDRESS", address(0));
        if (falconVerifier == address(0)) {
            console.log("No FALCON_VERIFIER_ADDRESS set - deploying Lamport-only factory");
        } else {
            console.log("FalconVerifier:", falconVerifier);
        }

        address entryPoint = vm.envOr("ENTRY_POINT_ADDRESS", DEFAULT_ENTRY_POINT);
        console.log("EntryPoint:", entryPoint);

        // 3. Deploy Factory
        PQCAccountFactory factory = new PQCAccountFactory(
            address(lamportVerifier),
            falconVerifier,
            entryPoint
        );
        console.log("PQCAccountFactory:", address(factory));

        vm.stopBroadcast();
    }
}
