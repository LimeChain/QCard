// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Script, console} from "forge-std/Script.sol";
import {ZKNOX_ethfalcon} from "../lib/ETHFALCON/src/ZKNOX_ethfalcon.sol";

contract DeployFalconEngine is Script {
    function run() external returns (address engineAddr) {
        vm.startBroadcast();

        ZKNOX_ethfalcon engine = new ZKNOX_ethfalcon();
        engineAddr = address(engine);
        console.log("FalconEngine:", engineAddr);

        vm.stopBroadcast();
    }
}
