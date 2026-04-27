// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IRoyaltyDistributor} from "../../src/interfaces/IRoyaltyDistributor.sol";

/// @dev No-op mock so SolverBondVault.slash can be tested without full wiring.
contract MockRoyaltyDistributor is IRoyaltyDistributor {
    bytes32 public lastOrderHash;
    uint256 public lastTokenId;
    uint256 public lastAmount;

    function distribute(uint256 slashAmount, bytes32 orderHash, uint256 tokenId) external override {
        lastAmount = slashAmount;
        lastOrderHash = orderHash;
        lastTokenId = tokenId;
    }
}
