// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/access/Ownable.sol";
import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";
import {FillRegistry} from "../src/FillRegistry.sol";
import {SolverBondVault} from "../src/SolverBondVault.sol";
import {MockReckonRegistrar} from "./mocks/MockReckonRegistrar.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {ReckonErrors} from "../src/lib/ReckonErrors.sol";
import {ReckonEvents} from "../src/lib/ReckonEvents.sol";

contract FillRegistryTest is Test {
    FillRegistry internal registry;
    SolverBondVault internal vault;
    MockReckonRegistrar internal solverReg;
    MockUSDC internal usdc;

    address internal admin = makeAddr("admin");
    address internal recorder = makeAddr("recorder");
    address internal stranger = makeAddr("stranger");
    address internal solver = makeAddr("solver");
    address internal swapper = makeAddr("swapper");
    address internal challengerContract = makeAddr("challengerContract");

    bytes32 internal solverNode = keccak256("solver.solvers.reckon.eth");
    bytes32 internal sampleOrderHash = keccak256("orderHash.1");

    address internal tokenIn = makeAddr("tokenIn");
    address internal tokenOut = makeAddr("tokenOut");

    function setUp() public {
        usdc = new MockUSDC();
        solverReg = new MockReckonRegistrar();
        vault = new SolverBondVault(admin, IERC20(address(usdc)), solverReg);
        registry = new FillRegistry(admin, solverReg, vault, recorder);
        vm.prank(admin);
        vault.setFillRegistry(address(registry));
        solverReg.mint(solver, solverNode, MockReckonRegistrar.Role.Solver);
    }

    // -- constructor --

    function test_constructor_sets_recorder_and_registry() public view {
        assertEq(address(registry.solverRegistry()), address(solverReg));
        assertEq(address(registry.solverBondVault()), address(vault));
        assertEq(registry.recorder(), recorder);
        assertEq(registry.owner(), admin);
        assertEq(registry.challengeWindowBlocks(), 1800);
    }

    function test_constructor_reverts_on_zero_registry() public {
        vm.expectRevert(ReckonErrors.ZeroAddress.selector);
        new FillRegistry(admin, MockReckonRegistrar(address(0)), vault, recorder);
    }

    function test_constructor_reverts_on_zero_vault() public {
        vm.expectRevert(ReckonErrors.ZeroAddress.selector);
        new FillRegistry(admin, solverReg, SolverBondVault(address(0)), recorder);
    }

    function test_constructor_reverts_on_zero_recorder() public {
        vm.expectRevert(ReckonErrors.ZeroAddress.selector);
        new FillRegistry(admin, solverReg, vault, address(0));
    }

    // -- rotateRecorder --

    function test_rotateRecorder_only_owner() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        registry.rotateRecorder(makeAddr("next"));
    }

    function test_rotateRecorder_reverts_on_zero() public {
        vm.prank(admin);
        vm.expectRevert(ReckonErrors.ZeroAddress.selector);
        registry.rotateRecorder(address(0));
    }

    function test_rotateRecorder_writes_and_emits() public {
        address next = makeAddr("nextRecorder");
        vm.expectEmit(true, true, false, false, address(registry));
        emit ReckonEvents.RecorderRotated(recorder, next);
        vm.prank(admin);
        registry.rotateRecorder(next);
        assertEq(registry.recorder(), next);
    }

    // -- recordFill --

    function _record(bytes32 orderHash, uint8 outputsLength) internal {
        vm.prank(recorder);
        registry.recordFill({
            orderHash: orderHash,
            filler: solver,
            swapper: swapper,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            inputAmount: 1_000e6,
            outputAmount: 0.27 ether,
            eboTolerance: 50,
            outputsLength: outputsLength,
            fillBlock: uint64(block.number)
        });
    }

    function test_recordFill_only_recorder() public {
        vm.prank(stranger);
        vm.expectRevert(ReckonErrors.NotRecorder.selector);
        registry.recordFill(sampleOrderHash, solver, swapper, tokenIn, tokenOut, 1, 1, 50, 1, uint64(block.number));
    }

    function test_recordFill_rejects_multi_output() public {
        vm.prank(recorder);
        vm.expectRevert(ReckonErrors.MultiOutputUnsupported.selector);
        registry.recordFill(sampleOrderHash, solver, swapper, tokenIn, tokenOut, 1, 1, 50, 2, uint64(block.number));
    }

    function test_recordFill_rejects_zero_outputs() public {
        vm.prank(recorder);
        vm.expectRevert(ReckonErrors.MultiOutputUnsupported.selector);
        registry.recordFill(sampleOrderHash, solver, swapper, tokenIn, tokenOut, 1, 1, 50, 0, uint64(block.number));
    }

    function test_recordFill_rejects_duplicate_orderHash() public {
        _record(sampleOrderHash, 1);
        vm.prank(recorder);
        vm.expectRevert(ReckonErrors.AlreadyRecorded.selector);
        registry.recordFill(sampleOrderHash, solver, swapper, tokenIn, tokenOut, 1, 1, 50, 1, uint64(block.number));
    }

    function test_recordFill_reverts_for_unregistered_filler() public {
        vm.prank(recorder);
        vm.expectRevert(ReckonErrors.NotRegistered.selector);
        registry.recordFill(sampleOrderHash, stranger, swapper, tokenIn, tokenOut, 1, 1, 50, 1, uint64(block.number));
    }

    function test_recordFill_writes_record_and_emits() public {
        uint64 fb = uint64(block.number);
        vm.expectEmit(true, true, true, true, address(registry));
        emit ReckonEvents.FillRecorded(sampleOrderHash, solverNode, swapper, fb);
        _record(sampleOrderHash, 1);

        (
            bytes32 fillerNamehash,
            address recSwapper,
            address recTokenIn,
            address recTokenOut,
            uint128 inAmt,
            uint128 outAmt,
            uint16 tol,
            uint64 fillBlock,
            uint64 deadline,
            bool slashed
        ) = registry.fills(sampleOrderHash);
        assertEq(fillerNamehash, solverNode);
        assertEq(recSwapper, swapper);
        assertEq(recTokenIn, tokenIn);
        assertEq(recTokenOut, tokenOut);
        assertEq(inAmt, 1_000e6);
        assertEq(outAmt, 0.27 ether);
        assertEq(tol, 50);
        assertEq(fillBlock, fb);
        assertEq(deadline, fb + 1800);
        assertFalse(slashed);
    }

    function test_recordFill_locks_solver_bond() public {
        assertEq(vault.openFillCount(solverNode), 0);
        _record(sampleOrderHash, 1);
        assertEq(vault.openFillCount(solverNode), 1);

        bytes32 second = keccak256("orderHash.2");
        _record(second, 1);
        assertEq(vault.openFillCount(solverNode), 2);
    }

    // -- anchorBatch --

    function test_anchorBatch_only_recorder() public {
        vm.prank(stranger);
        vm.expectRevert(ReckonErrors.NotRecorder.selector);
        registry.anchorBatch(keccak256("root"), keccak256("first"), keccak256("last"));
    }

    function test_anchorBatch_emits_event() public {
        bytes32 root = keccak256("root.42");
        bytes32 first = keccak256("first");
        bytes32 last = keccak256("last");

        vm.expectEmit(true, false, false, true, address(registry));
        emit ReckonEvents.FillBatchAnchored(root, first, last);
        vm.prank(recorder);
        registry.anchorBatch(root, first, last);
    }

    // -- addChallenger / removeChallenger --

    function test_addChallenger_writes_and_emits() public {
        vm.expectEmit(true, false, false, false, address(registry));
        emit ReckonEvents.ChallengerAdded(challengerContract);
        vm.prank(admin);
        registry.addChallenger(challengerContract);
        assertTrue(registry.isChallenger(challengerContract));
    }

    function test_addChallenger_only_owner() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        registry.addChallenger(challengerContract);
    }

    function test_addChallenger_reverts_on_zero() public {
        vm.prank(admin);
        vm.expectRevert(ReckonErrors.ZeroAddress.selector);
        registry.addChallenger(address(0));
    }

    function test_addChallenger_reverts_on_duplicate() public {
        vm.startPrank(admin);
        registry.addChallenger(challengerContract);
        vm.expectRevert(ReckonErrors.ChallengerAlreadyAdded.selector);
        registry.addChallenger(challengerContract);
        vm.stopPrank();
    }

    function test_addChallenger_supports_multiple() public {
        address c2 = makeAddr("challenger2");
        vm.startPrank(admin);
        registry.addChallenger(challengerContract);
        registry.addChallenger(c2);
        vm.stopPrank();
        assertTrue(registry.isChallenger(challengerContract));
        assertTrue(registry.isChallenger(c2));
    }

    function test_removeChallenger_clears_and_emits() public {
        vm.startPrank(admin);
        registry.addChallenger(challengerContract);
        vm.expectEmit(true, false, false, false, address(registry));
        emit ReckonEvents.ChallengerRemoved(challengerContract);
        registry.removeChallenger(challengerContract);
        vm.stopPrank();
        assertFalse(registry.isChallenger(challengerContract));
    }

    function test_removeChallenger_reverts_when_not_added() public {
        vm.prank(admin);
        vm.expectRevert(ReckonErrors.ChallengerNotFound.selector);
        registry.removeChallenger(challengerContract);
    }

    // -- getFill --

    function test_getFill_returns_record() public {
        _record(sampleOrderHash, 1);
        FillRegistry.FillRecord memory r = registry.getFill(sampleOrderHash);
        assertEq(r.fillerNamehash, solverNode);
        assertEq(r.swapper, swapper);
        assertEq(r.tokenIn, tokenIn);
        assertEq(r.tokenOut, tokenOut);
        assertEq(r.inputAmount, 1_000e6);
        assertEq(r.outputAmount, 0.27 ether);
        assertEq(r.eboTolerance, 50);
        assertEq(r.challengeDeadline, uint64(block.number) + 1800);
        assertFalse(r.slashed);
    }

    function test_getFill_returns_zero_for_unknown_orderHash() public view {
        FillRegistry.FillRecord memory r = registry.getFill(keccak256("nope"));
        assertEq(r.fillBlock, 0);
        assertEq(r.swapper, address(0));
    }

    // -- markSlashed --

    function _wireChallenger() internal {
        vm.prank(admin);
        registry.addChallenger(challengerContract);
    }

    function test_markSlashed_only_challenger() public {
        _record(sampleOrderHash, 1);
        _wireChallenger();
        vm.prank(stranger);
        vm.expectRevert(ReckonErrors.NotChallenger.selector);
        registry.markSlashed(sampleOrderHash);
    }

    function test_markSlashed_reverts_when_fill_not_found() public {
        _wireChallenger();
        vm.prank(challengerContract);
        vm.expectRevert(ReckonErrors.FillNotFound.selector);
        registry.markSlashed(keccak256("ghost"));
    }

    function test_markSlashed_writes_and_emits() public {
        _record(sampleOrderHash, 1);
        _wireChallenger();

        vm.expectEmit(true, false, false, false, address(registry));
        emit ReckonEvents.FillSlashedMarked(sampleOrderHash);
        vm.prank(challengerContract);
        registry.markSlashed(sampleOrderHash);

        FillRegistry.FillRecord memory r = registry.getFill(sampleOrderHash);
        assertTrue(r.slashed);
    }

    function test_markSlashed_unlocks_fill_counter() public {
        _record(sampleOrderHash, 1);
        _wireChallenger();
        assertEq(vault.openFillCount(solverNode), 1);

        vm.prank(challengerContract);
        registry.markSlashed(sampleOrderHash);

        assertEq(vault.openFillCount(solverNode), 0);
    }

    function test_markSlashed_reverts_on_already_slashed() public {
        _record(sampleOrderHash, 1);
        _wireChallenger();
        vm.prank(challengerContract);
        registry.markSlashed(sampleOrderHash);

        vm.prank(challengerContract);
        vm.expectRevert(ReckonErrors.AlreadySlashed.selector);
        registry.markSlashed(sampleOrderHash);
    }

    function test_recordFill_two_solvers_independent_counters() public {
        address solver2 = makeAddr("solver2");
        bytes32 solver2Node = keccak256("solver2.solvers.reckon.eth");
        solverReg.mint(solver2, solver2Node, MockReckonRegistrar.Role.Solver);

        _record(sampleOrderHash, 1);

        vm.prank(recorder);
        registry.recordFill(
            keccak256("orderHash.s2"),
            solver2,
            swapper,
            tokenIn,
            tokenOut,
            1,
            1,
            50,
            1,
            uint64(block.number)
        );

        assertEq(vault.openFillCount(solverNode), 1);
        assertEq(vault.openFillCount(solver2Node), 1);
    }
}
