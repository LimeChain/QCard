// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Script, console} from "forge-std/Script.sol";
import {ZKNOX_ethfalcon} from "ETHFALCON/ZKNOX_ethfalcon.sol";
import {ZKNOX_ethdilithium} from "ETHDILITHIUM/ZKNOX_ethdilithium.sol";
import {PqcAccountFactory} from "../src/pqc4337/PqcAccountFactory.sol";

contract DeployPqc4337 is Script {
    address constant ENTRY_POINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

    function run() external {
        vm.startBroadcast();

        ZKNOX_ethfalcon falconEthVerifier = new ZKNOX_ethfalcon();
        console.log("FalconEthVerifier:", address(falconEthVerifier));

        ZKNOX_ethdilithium mldsaEthVerifier = new ZKNOX_ethdilithium();
        console.log("MlDsaEthVerifier:", address(mldsaEthVerifier));

        PqcAccountFactory factory = new PqcAccountFactory(
            ENTRY_POINT,
            falconEthVerifier,
            mldsaEthVerifier
        );
        console.log("PqcAccountFactory:", address(factory));
        console.log("EntryPoint:", ENTRY_POINT);

        vm.stopBroadcast();
    }
}
