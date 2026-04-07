// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Script, console} from "forge-std/Script.sol";
import {LamportVerifier} from "../src/lamport/LamportVerifier.sol";

/// @notice Deploy the Lamport verifier to Base Sepolia
/// @dev Run: forge script script/DeployLamport.s.sol --rpc-url base_sepolia --broadcast
contract DeployLamport is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        LamportVerifier verifier = new LamportVerifier();
        console.log("LamportVerifier deployed at:", address(verifier));

        vm.stopBroadcast();
    }
}
