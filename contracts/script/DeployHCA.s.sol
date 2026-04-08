// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Script, console} from "forge-std/Script.sol";
import {LamportVerifier} from "../src/verifiers/LamportVerifier.sol";
import {ECDSAVerifier} from "../src/verifiers/ECDSAVerifier.sol";
import {FalconVerifier} from "../src/verifiers/FalconVerifier.sol";
import {HCAFactory} from "../src/HCAFactory.sol";

contract DeployHCA is Script {
    // EntryPoint v0.6 on Base Sepolia
    address constant ENTRY_POINT = 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789;

    function run() external {
        vm.startBroadcast();

        LamportVerifier lamport = new LamportVerifier();
        console.log("LamportVerifier:", address(lamport));

        ECDSAVerifier ecdsa = new ECDSAVerifier();
        console.log("ECDSAVerifier:", address(ecdsa));

        // Falcon verifier requires an ETHFALCON engine address.
        // Pass address(0) to skip if no engine is deployed yet.
        address falconEngine = vm.envOr("FALCON_ENGINE", address(0));
        address falconVerifier;
        if (falconEngine != address(0)) {
            FalconVerifier falcon = new FalconVerifier(falconEngine);
            falconVerifier = address(falcon);
            console.log("FalconVerifier:", falconVerifier);
        } else {
            falconVerifier = address(0);
            console.log("FalconVerifier: SKIPPED (no FALCON_ENGINE set)");
        }

        HCAFactory factory = new HCAFactory(
            address(lamport),
            falconVerifier,
            address(ecdsa),
            ENTRY_POINT
        );
        console.log("HCAFactory:", address(factory));

        vm.stopBroadcast();
    }
}
