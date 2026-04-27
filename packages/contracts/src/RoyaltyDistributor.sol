// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {FillRegistry} from "./FillRegistry.sol";
import {OwnerRegistry} from "./OwnerRegistry.sol";
import {ReckonErrors} from "./lib/ReckonErrors.sol";
import {ReckonEvents} from "./lib/ReckonEvents.sol";

/// @title RoyaltyDistributor
/// @notice Splits slash proceeds between swapper, ChallengerNFT owner, and
///         protocol treasury. Queues owner payouts when the OwnerRegistry
///         attestation is stale. Called by SolverBondVault.slash as part of
///         the unified slash-and-distribute flow.
contract RoyaltyDistributor is Ownable {
    using SafeERC20 for IERC20;

    struct Split {
        uint16 swapperBps;
        uint16 ownerBps;
        uint16 protocolBps;
    }

    IERC20 public immutable usdc;
    OwnerRegistry public immutable ownerRegistry;
    FillRegistry public immutable fillRegistry;

    address public protocolTreasury;
    uint64 public stalenessThreshold = 24 hours;

    address public solverBondVault;

    mapping(uint256 tokenId => Split) public splitOf;
    mapping(uint256 tokenId => uint256) public queuedForOwner;

    constructor(
        address initialOwner,
        IERC20 _usdc,
        OwnerRegistry _ownerRegistry,
        FillRegistry _fillRegistry,
        address _protocolTreasury
    ) Ownable(initialOwner) {
        if (
            address(_usdc) == address(0) || address(_ownerRegistry) == address(0)
                || address(_fillRegistry) == address(0) || _protocolTreasury == address(0)
        ) {
            revert ReckonErrors.ZeroAddress();
        }
        usdc = _usdc;
        ownerRegistry = _ownerRegistry;
        fillRegistry = _fillRegistry;
        protocolTreasury = _protocolTreasury;
    }

    /// @notice One-shot setter for the SolverBondVault address. Owner only.
    function setSolverBondVault(address _solverBondVault) external onlyOwner {
        if (_solverBondVault == address(0)) revert ReckonErrors.ZeroAddress();
        if (solverBondVault != address(0)) revert ReckonErrors.AlreadyInitialized();
        solverBondVault = _solverBondVault;
    }

    /// @notice Override the default split for a specific tokenId. Owner only.
    function setSplit(uint256 tokenId, uint16 swapperBps, uint16 ownerBps, uint16 protocolBps) external onlyOwner {
        if (uint256(swapperBps) + ownerBps + protocolBps != 10_000) {
            revert ReckonErrors.InvalidSplit();
        }
        splitOf[tokenId] = Split(swapperBps, ownerBps, protocolBps);
    }

    /// @notice Returns the effective split for a tokenId (custom or default).
    function effectiveSplit(uint256 tokenId) public view returns (Split memory) {
        Split memory s = splitOf[tokenId];
        if (uint256(s.swapperBps) + s.ownerBps + s.protocolBps == 0) {
            return Split(6000, 3000, 1000);
        }
        return s;
    }

    /// @notice Distribute slash proceeds. SolverBondVault only.
    /// @dev Reads the swapper from the FillRegistry via orderHash.
    function distribute(uint256 slashAmount, bytes32 orderHash, uint256 tokenId) external {
        if (msg.sender != solverBondVault) revert ReckonErrors.NotSolverBondVault();

        FillRegistry.FillRecord memory fill = fillRegistry.getFill(orderHash);
        if (fill.fillBlock == 0) revert ReckonErrors.FillNotFound();
        address swapper = fill.swapper;

        Split memory s = effectiveSplit(tokenId);

        uint256 swapperAmt = slashAmount * s.swapperBps / 10_000;
        uint256 ownerAmt = slashAmount * s.ownerBps / 10_000;
        uint256 protocolAmt = slashAmount - swapperAmt - ownerAmt;

        if (ownerRegistry.isStale(tokenId, stalenessThreshold)) {
            queuedForOwner[tokenId] += ownerAmt;
            emit ReckonEvents.RoyaltyQueued(tokenId, ownerAmt);
        } else {
            address owner = ownerRegistry.ownerOf(tokenId);
            usdc.safeTransfer(owner, ownerAmt);
        }

        emit ReckonEvents.RoyaltyPaid(tokenId, swapper, swapperAmt, ownerAmt, protocolAmt);

        usdc.safeTransfer(swapper, swapperAmt);
        usdc.safeTransfer(protocolTreasury, protocolAmt);
    }

    /// @notice Claim queued owner royalties after re-attestation.
    function claimQueued(uint256 tokenId) external {
        if (ownerRegistry.isStale(tokenId, stalenessThreshold)) {
            revert ReckonErrors.AttestationStale();
        }
        uint256 amount = queuedForOwner[tokenId];
        if (amount == 0) revert ReckonErrors.NothingQueued();

        queuedForOwner[tokenId] = 0;

        address owner = ownerRegistry.ownerOf(tokenId);
        emit ReckonEvents.RoyaltyClaimed(tokenId, owner, amount);
        usdc.safeTransfer(owner, amount);
    }
}
