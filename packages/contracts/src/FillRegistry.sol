// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IReckonRegistrar} from "./interfaces/IReckonRegistrar.sol";
import {SolverBondVault} from "./SolverBondVault.sol";
import {ReckonErrors} from "./lib/ReckonErrors.sol";
import {ReckonEvents} from "./lib/ReckonEvents.sol";

/// @title FillRegistry
/// @notice On-chain record of UniswapX fills as observed by the off-chain
///         relayer. The relayer EOA (`recorder`) writes fills here after
///         observing each `Fill` event from the UniswapX `PriorityOrderReactor`.
/// @dev `tokenIn` / `tokenOut` are part of the record from day one so
///      `Challenger.submit` can pass them straight to `EBBOOracle.computeBenchmark`.
contract FillRegistry is Ownable {
    struct FillRecord {
        bytes32 fillerNamehash;
        address swapper;
        address tokenIn;
        address tokenOut;
        uint128 inputAmount;
        uint128 outputAmount;
        uint16 eboTolerance;
        uint64 fillBlock;
        uint64 challengeDeadline;
        bool slashed;
    }

    IReckonRegistrar public immutable solverRegistry;
    SolverBondVault public immutable solverBondVault;

    /// @notice The relayer EOA permitted to write fills. Rotatable by owner.
    address public recorder;

    /// @notice The Challenger contract permitted to mark fills as slashed.
    ///         Set once via `setChallenger`.
    address public challenger;

    /// @notice Default challenge window (≈ 30 min on Base 1s blocks).
    uint64 public challengeWindowBlocks = 1800;

    mapping(bytes32 orderHash => FillRecord) public fills;

    constructor(
        address initialOwner,
        IReckonRegistrar _solverRegistry,
        SolverBondVault _solverBondVault,
        address initialRecorder
    ) Ownable(initialOwner) {
        if (
            address(_solverRegistry) == address(0) || address(_solverBondVault) == address(0)
                || initialRecorder == address(0)
        ) {
            revert ReckonErrors.ZeroAddress();
        }
        solverRegistry = _solverRegistry;
        solverBondVault = _solverBondVault;
        recorder = initialRecorder;
    }

    /// @notice Rotate the recorder EOA. Owner only.
    function rotateRecorder(address next) external onlyOwner {
        if (next == address(0)) revert ReckonErrors.ZeroAddress();
        emit ReckonEvents.RecorderRotated(recorder, next);
        recorder = next;
    }

    /// @notice One-shot setter for the Challenger contract address. Owner only.
    function setChallenger(address _challenger) external onlyOwner {
        if (_challenger == address(0)) revert ReckonErrors.ZeroAddress();
        if (challenger != address(0)) revert ReckonErrors.AlreadyInitialized();
        challenger = _challenger;
    }

    /// @notice Record an observed UniswapX fill. Recorder only.
    /// @dev Rejects multi-output orders and duplicate `orderHash`. Calls
    ///      `SolverBondVault.lockOnFill(node)` to gate the solver's withdraw
    ///      until the challenge window closes.
    function recordFill(
        bytes32 orderHash,
        address filler,
        address swapper,
        address tokenIn,
        address tokenOut,
        uint128 inputAmount,
        uint128 outputAmount,
        uint16 eboTolerance,
        uint8 outputsLength,
        uint64 fillBlock
    ) external {
        if (msg.sender != recorder) revert ReckonErrors.NotRecorder();
        if (outputsLength != 1) revert ReckonErrors.MultiOutputUnsupported();
        if (fills[orderHash].fillBlock != 0) revert ReckonErrors.AlreadyRecorded();

        // Defense-in-depth: ReckonValidator already gates this, but the relayer
        // can be replaced and the gate isn't part of the on-chain trust path here.
        bytes32 node = solverRegistry.namehashOf(filler);

        uint64 challengeDeadline = fillBlock + challengeWindowBlocks;

        fills[orderHash] = FillRecord({
            fillerNamehash: node,
            swapper: swapper,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            inputAmount: inputAmount,
            outputAmount: outputAmount,
            eboTolerance: eboTolerance,
            fillBlock: fillBlock,
            challengeDeadline: challengeDeadline,
            slashed: false
        });

        emit ReckonEvents.FillRecorded(orderHash, node, swapper, fillBlock);

        solverBondVault.lockOnFill(node);
    }

    /// @notice Anchor the Merkle root of a batched fill audit log uploaded to
    ///         0G Galileo Storage. Recorder only.
    /// @dev Relayer calls this every 50 fills, after
    ///      uploading the batch file via the 0G Storage SDK and capturing the
    ///      returned root hash.
    function anchorBatch(bytes32 rootHash, bytes32 firstOrderHash, bytes32 lastOrderHash) external {
        if (msg.sender != recorder) revert ReckonErrors.NotRecorder();
        emit ReckonEvents.FillBatchAnchored(rootHash, firstOrderHash, lastOrderHash);
    }

    /// @notice Read a fill record by order hash.
    function getFill(bytes32 orderHash) external view returns (FillRecord memory) {
        return fills[orderHash];
    }

    /// @notice Mark a fill as slashed. Challenger only. Drives the bond-unlock
    ///         path so the solver isn't double-locked after their slash settles.
    function markSlashed(bytes32 orderHash) external {
        if (msg.sender != challenger) revert ReckonErrors.NotChallenger();
        FillRecord storage r = fills[orderHash];
        if (r.fillBlock == 0) revert ReckonErrors.FillNotFound();
        if (r.slashed) revert ReckonErrors.AlreadySlashed();

        r.slashed = true;
        emit ReckonEvents.FillSlashedMarked(orderHash);

        solverBondVault.unlockOnFill(r.fillerNamehash);
    }
}
