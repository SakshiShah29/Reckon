// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {ReckonWildcardResolver} from "../src/ens/ReckonWildcardResolver.sol";

/// @notice Deploys ReckonWildcardResolver to Ethereum mainnet (or Sepolia for dev).
///
///   Usage (dry-run on Sepolia):
///     forge script DeployENSResolver --rpc-url sepolia --simulate -vvv
///
///   Usage (mainnet broadcast):
///     forge script DeployENSResolver --rpc-url ethereum --broadcast --verify -vvv
///
///   Post-deploy manual step (one-time, from the wallet that owns reckon.eth):
///     Visit app.ens.domains → reckon.eth → Records → set Resolver to the
///     deployed address. After this, every ENS client resolving *.reckon.eth
///     hits the wildcard resolver, which reverts with OffchainLookup and the
///     client follows to the CCIP-Read gateway transparently.
contract DeployENSResolver is Script {
    function run() external {
        address deployer = msg.sender;
        address owner = vm.envOr("OWNER", deployer);
        address signer = vm.envOr("GATEWAY_SIGNER", deployer);
        string memory gatewayUrl = vm.envOr(
            "GATEWAY_URL",
            string("https://gateway.reckon.fi/{sender}/{data}.json")
        );

        vm.startBroadcast();

        string[] memory urls = new string[](1);
        urls[0] = gatewayUrl;

        ReckonWildcardResolver resolver = new ReckonWildcardResolver(owner, signer, urls);

        vm.stopBroadcast();

        console.log("=== ENS Resolver Deployment ===");
        console.log("ReckonWildcardResolver:", address(resolver));
        console.log("Owner:                ", owner);
        console.log("Signer:               ", signer);
        console.log("Gateway URL:          ", gatewayUrl);
        console.log("");
        console.log("Next step: set reckon.eth resolver to", address(resolver));
        console.log("  via app.ens.domains or ENS Registry.setResolver()");
    }
}
