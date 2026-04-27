// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable} from "@openzeppelin/access/Ownable.sol";
import {ReckonErrors} from "./lib/ReckonErrors.sol";
import {ReckonEvents} from "./lib/ReckonEvents.sol";

/// @title OwnerRegistry
/// @notice Relayer-attested cross-chain ownerOf cache for ChallengerNFT (lives on
///         0G Galileo) consumed by RoyaltyDistributor and Challenger on Base.
contract OwnerRegistry is Ownable {
    struct Attestation {
        address owner;
        uint64 attestedAt;
    }

    address public attester;

    mapping(uint256 tokenId => Attestation) internal _attestations;

    constructor(address initialOwner, address initialAttester) Ownable(initialOwner) {
        if (initialAttester == address(0)) revert ReckonErrors.ZeroAddress();
        attester = initialAttester;
    }

    /// @notice Rotate the attester EOA. Admin only.
    function rotateAttester(address next) external onlyOwner {
        if (next == address(0)) revert ReckonErrors.ZeroAddress();
        emit ReckonEvents.AttesterRotated(attester, next);
        attester = next;
    }

    /// @notice Record a new owner for `tokenId`. Attester only.
    function attestOwner(uint256 tokenId, address newOwner) external {
        if (msg.sender != attester) revert ReckonErrors.NotAttester();
        if (newOwner == address(0)) revert ReckonErrors.ZeroAddress();
        uint64 ts = uint64(block.timestamp);
        _attestations[tokenId] = Attestation({owner: newOwner, attestedAt: ts});
        emit ReckonEvents.OwnerAttested(tokenId, newOwner, ts);
    }

    /// @notice Returns the last attested owner for `tokenId`.
    /// @dev Reverts if no attestation has ever been recorded.
    function ownerOf(uint256 tokenId) external view returns (address) {
        Attestation memory a = _attestations[tokenId];
        if (a.attestedAt == 0) revert ReckonErrors.NeverAttested();
        return a.owner;
    }

    /// @notice Seconds elapsed since the last attestation for `tokenId`.
    /// @dev Reverts if no attestation has ever been recorded.
    function freshnessOf(uint256 tokenId) external view returns (uint64) {
        Attestation memory a = _attestations[tokenId];
        if (a.attestedAt == 0) revert ReckonErrors.NeverAttested();
        return uint64(block.timestamp) - a.attestedAt;
    }

    /// @notice True iff the last attestation for `tokenId` is older than `maxAgeSeconds`.
    /// @dev Returns true if never attested (caller must treat that as stale).
    function isStale(uint256 tokenId, uint64 maxAgeSeconds) external view returns (bool) {
        Attestation memory a = _attestations[tokenId];
        if (a.attestedAt == 0) return true;
        return uint64(block.timestamp) - a.attestedAt > maxAgeSeconds;
    }
}
