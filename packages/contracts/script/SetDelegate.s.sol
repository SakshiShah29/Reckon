// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {Challenger} from "../src/Challenger.sol";

contract SetDelegate is Script {
    function run() external {
        address challengerAddr = vm.envAddress("CHALLENGER");
        uint256 agentTokenId = vm.envUint("AGENT_TOKEN_ID");
        address delegate = vm.envAddress("DELEGATE");

        Challenger challenger = Challenger(challengerAddr);

        vm.startBroadcast();
        challenger.setAgentDelegate(agentTokenId, delegate);
        vm.stopBroadcast();

        console.log("=== Delegate Set ===");
        console.log("Challenger:   ", challengerAddr);
        console.log("Agent Token ID:", agentTokenId);
        console.log("Delegate:     ", delegate);
    }
}
