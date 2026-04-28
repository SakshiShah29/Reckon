// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ChallengerNFT} from "../src/inft/ChallengerNFT.sol";
import {MockVerifier} from "../src/inft/MockVerifier.sol";

contract DeployZGGalileo is Script {
    function run() external {
        address admin = vm.envOr("ADMIN", msg.sender);
        string memory storageInfo = vm.envOr("STORAGE_INFO", string(""));

        vm.startBroadcast();

        MockVerifier verifier = new MockVerifier();

        ChallengerNFT impl = new ChallengerNFT();
        bytes memory initData = abi.encodeCall(
            impl.initialize,
            ("Reckon Challenger", "RECK", storageInfo, address(verifier), admin)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);

        vm.stopBroadcast();

        console.log("=== 0G Galileo Deployment ===");
        console.log("MockVerifier:        ", address(verifier));
        console.log("ChallengerNFT (impl):", address(impl));
        console.log("ChallengerNFT (proxy):", address(proxy));
    }
}
