// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IRoyaltyDistributor {
    function distribute(uint256 slashAmount, bytes32 orderHash, uint256 tokenId) external;
}
