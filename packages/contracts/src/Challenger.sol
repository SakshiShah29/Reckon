// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable} from "@openzeppelin/access/Ownable.sol";
import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/token/ERC20/utils/SafeERC20.sol";
import {ISignatureTransfer} from "permit2/interfaces/ISignatureTransfer.sol";
import {FillRegistry} from "./FillRegistry.sol";
import {EBBOOracle} from "./EBBOOracle.sol";
import {SolverBondVault} from "./SolverBondVault.sol";
import {OwnerRegistry} from "./OwnerRegistry.sol";
import {IReckonRegistrar} from "./interfaces/IReckonRegistrar.sol";
import {IReckonNamehashLookup} from "./interfaces/IReckonNamehashLookup.sol";
import {ReckonErrors} from "./lib/ReckonErrors.sol";
import {ReckonEvents} from "./lib/ReckonEvents.sol";

/// @title Challenger
/// @notice Orchestrates EBBO challenges against UniswapX fills. Pulls a
///         challenger bond via Permit2, evaluates the fill against the EBBO
///         benchmark, and either slashes the solver (success) or forfeits the
///         challenger's bond to the protocol treasury (failure).
contract Challenger is Ownable {
    using SafeERC20 for IERC20;

    FillRegistry public immutable fillRegistry;
    EBBOOracle public immutable ebbo;
    SolverBondVault public immutable solverBondVault;
    OwnerRegistry public immutable ownerRegistry;
    IReckonRegistrar public immutable solverRegistry;
    IReckonNamehashLookup public immutable challengerRegistry;
    ISignatureTransfer public immutable permit2;
    IERC20 public immutable usdc;

    address public protocolTreasury;
    uint16 public minChallengerBondBps = 1000;

    constructor(
        address initialOwner,
        FillRegistry _fillRegistry,
        EBBOOracle _ebbo,
        SolverBondVault _solverBondVault,
        OwnerRegistry _ownerRegistry,
        IReckonRegistrar _solverRegistry,
        IReckonNamehashLookup _challengerRegistry,
        ISignatureTransfer _permit2,
        IERC20 _usdc,
        address _protocolTreasury
    ) Ownable(initialOwner) {
        if (
            address(_fillRegistry) == address(0) || address(_ebbo) == address(0)
                || address(_solverBondVault) == address(0) || address(_ownerRegistry) == address(0)
                || address(_solverRegistry) == address(0) || address(_challengerRegistry) == address(0)
                || address(_permit2) == address(0) || address(_usdc) == address(0)
                || _protocolTreasury == address(0)
        ) {
            revert ReckonErrors.ZeroAddress();
        }
        fillRegistry = _fillRegistry;
        ebbo = _ebbo;
        solverBondVault = _solverBondVault;
        ownerRegistry = _ownerRegistry;
        solverRegistry = _solverRegistry;
        challengerRegistry = _challengerRegistry;
        permit2 = _permit2;
        usdc = _usdc;
        protocolTreasury = _protocolTreasury;
    }

    /// @notice Submit an EBBO challenge against a recorded fill.
    function submit(
        bytes32 orderHash,
        uint256 challengerBond,
        uint256 agentTokenId,
        ISignatureTransfer.PermitTransferFrom calldata permit,
        bytes calldata signature
    ) external {
        (FillRegistry.FillRecord memory r, bytes32 challengerNode) =
            _preflight(orderHash, msg.sender, agentTokenId);

        uint256 solverBond = solverBondVault.bondedAmount(r.fillerNamehash);
        if (challengerBond < solverBond * minChallengerBondBps / 10_000) {
            revert ReckonErrors.ChallengerBondTooSmall();
        }

        _pullBond(challengerBond, msg.sender, permit, signature);

        uint256 expectedOutput = _computeExpectedOutput(r);

        emit ReckonEvents.ChallengeSubmitted(orderHash, challengerNode, agentTokenId, challengerBond);

        if (r.outputAmount < expectedOutput) {
            _handleSuccess(orderHash, r.fillerNamehash, challengerNode, solverBond, expectedOutput - r.outputAmount, agentTokenId, challengerBond);
        } else {
            usdc.safeTransfer(protocolTreasury, challengerBond);
            emit ReckonEvents.ChallengeFailed(orderHash, r.fillerNamehash, msg.sender);
        }
    }

    function _computeExpectedOutput(FillRegistry.FillRecord memory r) internal view returns (uint256) {
        uint256 benchmark = ebbo.computeBenchmark(r.tokenIn, r.tokenOut);
        return benchmark * r.inputAmount / 1e18 * (10_000 - r.eboTolerance) / 10_000;
    }

    function _handleSuccess(
        bytes32 orderHash,
        bytes32 fillerNamehash,
        bytes32 challengerNode,
        uint256 solverBond,
        uint256 shortfall,
        uint256 agentTokenId,
        uint256 challengerBond
    ) internal {
        uint256 slashAmount = shortfall > solverBond ? solverBond : shortfall;

        solverBondVault.slash(fillerNamehash, slashAmount, orderHash, agentTokenId);
        fillRegistry.markSlashed(orderHash);

        usdc.safeTransfer(msg.sender, challengerBond);

        emit ReckonEvents.ChallengeSucceeded(orderHash, fillerNamehash, challengerNode, slashAmount);
    }

    function _preflight(bytes32 orderHash, address challengerEoa, uint256 agentTokenId)
        internal
        view
        returns (FillRegistry.FillRecord memory r, bytes32 challengerNode)
    {
        r = fillRegistry.getFill(orderHash);
        if (r.fillBlock == 0) revert ReckonErrors.FillNotFound();
        if (r.slashed) revert ReckonErrors.AlreadySlashed();
        if (block.number > r.challengeDeadline) revert ReckonErrors.ChallengeWindowClosed();
        if (!challengerRegistry.isRegistered(challengerEoa)) revert ReckonErrors.NotRegistered();

        challengerNode = challengerRegistry.namehashOf(challengerEoa);
        if (challengerNode == r.fillerNamehash) revert ReckonErrors.SelfChallengeForbidden();
        if (ownerRegistry.ownerOf(agentTokenId) != challengerEoa) revert ReckonErrors.NotAgentOwner();
    }

    function _pullBond(
        uint256 amount,
        address challengerEoa,
        ISignatureTransfer.PermitTransferFrom calldata permitData,
        bytes calldata sig
    ) internal {
        ISignatureTransfer.SignatureTransferDetails memory transferDetails =
            ISignatureTransfer.SignatureTransferDetails({to: address(this), requestedAmount: amount});

        permit2.permitTransferFrom(permitData, transferDetails, challengerEoa, sig);
    }
}
