// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @dev Returns a configurable benchmark price so Challenger tests don't need fork state.
contract MockEBBOOracle {
    uint256 public benchmarkPrice;

    function setBenchmarkPrice(uint256 price) external {
        benchmarkPrice = price;
    }

    function computeBenchmark(address, address) external view returns (uint256) {
        return benchmarkPrice;
    }
}
