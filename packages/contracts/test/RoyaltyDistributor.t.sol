// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/access/Ownable.sol";
import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";
import {RoyaltyDistributor} from "../src/RoyaltyDistributor.sol";
import {SolverBondVault} from "../src/SolverBondVault.sol";
import {FillRegistry} from "../src/FillRegistry.sol";
import {OwnerRegistry} from "../src/OwnerRegistry.sol";
import {MockReckonRegistrar} from "./mocks/MockReckonRegistrar.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {ReckonErrors} from "../src/lib/ReckonErrors.sol";
import {ReckonEvents} from "../src/lib/ReckonEvents.sol";

contract RoyaltyDistributorTest is Test {
    RoyaltyDistributor internal distributor;
    SolverBondVault internal vault;
    FillRegistry internal fillReg;
    OwnerRegistry internal ownerReg;
    MockReckonRegistrar internal solverReg;
    MockUSDC internal usdc;

    address internal admin = makeAddr("admin");
    address internal attester = makeAddr("attester");
    address internal recorder = makeAddr("recorder");
    address internal challengerContract = makeAddr("challengerContract");
    address internal stranger = makeAddr("stranger");
    address internal treasury = makeAddr("treasury");
    address internal swapper = makeAddr("swapper");
    address internal nftOwner = makeAddr("nftOwner");
    address internal solver = makeAddr("solver");

    bytes32 internal solverNode = keccak256("solver.solvers.reckon.eth");
    bytes32 internal orderHash = keccak256("orderHash.1");
    uint256 internal tokenId = 42;

    function setUp() public {
        usdc = new MockUSDC();
        solverReg = new MockReckonRegistrar();
        ownerReg = new OwnerRegistry(admin, attester);

        vault = new SolverBondVault(admin, IERC20(address(usdc)), solverReg);
        fillReg = new FillRegistry(admin, solverReg, vault, recorder);
        distributor = new RoyaltyDistributor(
            admin, IERC20(address(usdc)), ownerReg, fillReg, treasury
        );

        // Wire contracts
        vm.startPrank(admin);
        vault.setFillRegistry(address(fillReg));
        vault.setRoyaltyDistributor(address(distributor));
        vault.addChallenger(challengerContract);
        distributor.setSolverBondVault(address(vault));
        vm.stopPrank();

        // Register solver and deposit bond
        solverReg.mint(solver, solverNode, MockReckonRegistrar.Role.Solver);
        usdc.mint(solver, 10_000e6);
        vm.startPrank(solver);
        usdc.approve(address(vault), 10_000e6);
        vault.deposit(10_000e6);
        vm.stopPrank();

        // Record a fill so FillRegistry has an entry
        vm.prank(recorder);
        fillReg.recordFill({
            orderHash: orderHash,
            filler: solver,
            swapper: swapper,
            tokenIn: makeAddr("tokenIn"),
            tokenOut: makeAddr("tokenOut"),
            inputAmount: 1_000e6,
            outputAmount: 0.27 ether,
            eboTolerance: 50,
            outputsLength: 1,
            fillBlock: uint64(block.number)
        });

        // Attest an NFT owner
        vm.prank(attester);
        ownerReg.attestOwner(tokenId, nftOwner);
    }

    // ── constructor ──

    function test_constructor_sets_immutables() public view {
        assertEq(address(distributor.usdc()), address(usdc));
        assertEq(address(distributor.ownerRegistry()), address(ownerReg));
        assertEq(address(distributor.fillRegistry()), address(fillReg));
        assertEq(distributor.protocolTreasury(), treasury);
    }

    function test_constructor_reverts_zero_usdc() public {
        vm.expectRevert(ReckonErrors.ZeroAddress.selector);
        new RoyaltyDistributor(admin, IERC20(address(0)), ownerReg, fillReg, treasury);
    }

    function test_constructor_reverts_zero_ownerReg() public {
        vm.expectRevert(ReckonErrors.ZeroAddress.selector);
        new RoyaltyDistributor(admin, IERC20(address(usdc)), OwnerRegistry(address(0)), fillReg, treasury);
    }

    function test_constructor_reverts_zero_fillReg() public {
        vm.expectRevert(ReckonErrors.ZeroAddress.selector);
        new RoyaltyDistributor(admin, IERC20(address(usdc)), ownerReg, FillRegistry(address(0)), treasury);
    }

    function test_constructor_reverts_zero_treasury() public {
        vm.expectRevert(ReckonErrors.ZeroAddress.selector);
        new RoyaltyDistributor(admin, IERC20(address(usdc)), ownerReg, fillReg, address(0));
    }

    // ── setSolverBondVault ──

    function test_setSolverBondVault_reverts_on_second_call() public {
        vm.prank(admin);
        vm.expectRevert(ReckonErrors.AlreadyInitialized.selector);
        distributor.setSolverBondVault(makeAddr("other"));
    }

    function test_setSolverBondVault_only_owner() public {
        RoyaltyDistributor fresh = new RoyaltyDistributor(
            admin, IERC20(address(usdc)), ownerReg, fillReg, treasury
        );
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        fresh.setSolverBondVault(address(vault));
    }

    // ── default split ──

    function test_defaultSplit_60_30_10() public view {
        RoyaltyDistributor.Split memory s = distributor.effectiveSplit(999);
        assertEq(s.swapperBps, 6000);
        assertEq(s.ownerBps, 3000);
        assertEq(s.protocolBps, 1000);
    }

    // ── setSplit ──

    function test_setSplit_only_owner() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        distributor.setSplit(tokenId, 5000, 3000, 2000);
    }

    function test_setSplit_reverts_invalid_total() public {
        vm.prank(admin);
        vm.expectRevert(ReckonErrors.InvalidSplit.selector);
        distributor.setSplit(tokenId, 5000, 3000, 1000);
    }

    function test_setSplit_writes_custom_split() public {
        vm.prank(admin);
        distributor.setSplit(tokenId, 5000, 3000, 2000);
        RoyaltyDistributor.Split memory s = distributor.effectiveSplit(tokenId);
        assertEq(s.swapperBps, 5000);
        assertEq(s.ownerBps, 3000);
        assertEq(s.protocolBps, 2000);
    }

    // ── distribute (via slash) ──

    function test_distribute_only_solver_bond_vault() public {
        vm.prank(stranger);
        vm.expectRevert(ReckonErrors.NotSolverBondVault.selector);
        distributor.distribute(1000e6, orderHash, tokenId);
    }

    function test_distribute_reverts_unknown_orderHash() public {
        vm.prank(address(vault));
        vm.expectRevert(ReckonErrors.FillNotFound.selector);
        distributor.distribute(1000e6, keccak256("ghost"), tokenId);
    }

    function test_slash_distributes_to_swapper_and_protocol() public {
        vm.prank(challengerContract);
        vault.slash(solverNode, 1000e6, orderHash, tokenId);

        assertEq(usdc.balanceOf(swapper), 600e6);
        assertEq(usdc.balanceOf(treasury), 100e6);
    }

    function test_slash_distributes_to_owner_when_fresh() public {
        vm.prank(challengerContract);
        vault.slash(solverNode, 1000e6, orderHash, tokenId);

        assertEq(usdc.balanceOf(nftOwner), 300e6);
        assertEq(distributor.queuedForOwner(tokenId), 0);
    }

    function test_slash_queues_owner_when_stale() public {
        vm.warp(block.timestamp + 25 hours);

        vm.prank(challengerContract);
        vault.slash(solverNode, 1000e6, orderHash, tokenId);

        assertEq(usdc.balanceOf(nftOwner), 0);
        assertEq(distributor.queuedForOwner(tokenId), 300e6);
        assertEq(usdc.balanceOf(swapper), 600e6);
        assertEq(usdc.balanceOf(treasury), 100e6);
    }

    function test_slash_emits_royalty_paid() public {
        vm.expectEmit(true, true, false, true, address(distributor));
        emit ReckonEvents.RoyaltyPaid(tokenId, swapper, 600e6, 300e6, 100e6);

        vm.prank(challengerContract);
        vault.slash(solverNode, 1000e6, orderHash, tokenId);
    }

    function test_slash_with_custom_split() public {
        vm.prank(admin);
        distributor.setSplit(tokenId, 5000, 3000, 2000);

        vm.prank(challengerContract);
        vault.slash(solverNode, 1000e6, orderHash, tokenId);

        assertEq(usdc.balanceOf(swapper), 500e6);
        assertEq(usdc.balanceOf(nftOwner), 300e6);
        assertEq(usdc.balanceOf(treasury), 200e6);
    }

    function test_slash_remainder_goes_to_protocol() public {
        vm.prank(challengerContract);
        vault.slash(solverNode, 333e6, orderHash, tokenId);

        uint256 swapperAmt = 333e6 * 6000 / 10_000;
        uint256 ownerAmt = 333e6 * 3000 / 10_000;
        uint256 protocolAmt = 333e6 - swapperAmt - ownerAmt;

        assertEq(usdc.balanceOf(swapper), swapperAmt);
        assertEq(usdc.balanceOf(nftOwner), ownerAmt);
        assertEq(usdc.balanceOf(treasury), protocolAmt);
    }

    function test_slash_deducts_solver_bond() public {
        assertEq(vault.bondedAmount(solverNode), 10_000e6);

        vm.prank(challengerContract);
        vault.slash(solverNode, 1000e6, orderHash, tokenId);

        assertEq(vault.bondedAmount(solverNode), 9_000e6);
    }

    // ── claimQueued ──

    function test_claimQueued_after_reattest() public {
        vm.warp(block.timestamp + 25 hours);
        vm.prank(challengerContract);
        vault.slash(solverNode, 1000e6, orderHash, tokenId);
        assertEq(distributor.queuedForOwner(tokenId), 300e6);

        vm.prank(attester);
        ownerReg.attestOwner(tokenId, nftOwner);

        vm.expectEmit(true, true, false, true, address(distributor));
        emit ReckonEvents.RoyaltyClaimed(tokenId, nftOwner, 300e6);

        distributor.claimQueued(tokenId);

        assertEq(usdc.balanceOf(nftOwner), 300e6);
        assertEq(distributor.queuedForOwner(tokenId), 0);
    }

    function test_claimQueued_reverts_when_still_stale() public {
        vm.warp(block.timestamp + 25 hours);
        vm.prank(challengerContract);
        vault.slash(solverNode, 1000e6, orderHash, tokenId);

        vm.expectRevert(ReckonErrors.AttestationStale.selector);
        distributor.claimQueued(tokenId);
    }

    function test_claimQueued_reverts_when_nothing_queued() public {
        vm.expectRevert(ReckonErrors.NothingQueued.selector);
        distributor.claimQueued(tokenId);
    }

    function test_claimQueued_accumulates_multiple_slashes() public {
        bytes32 orderHash2 = keccak256("orderHash.2");
        vm.prank(recorder);
        fillReg.recordFill({
            orderHash: orderHash2,
            filler: solver,
            swapper: swapper,
            tokenIn: makeAddr("tokenIn"),
            tokenOut: makeAddr("tokenOut"),
            inputAmount: 1_000e6,
            outputAmount: 0.27 ether,
            eboTolerance: 50,
            outputsLength: 1,
            fillBlock: uint64(block.number)
        });

        vm.warp(block.timestamp + 25 hours);

        vm.startPrank(challengerContract);
        vault.slash(solverNode, 1000e6, orderHash, tokenId);
        vault.slash(solverNode, 1000e6, orderHash2, tokenId);
        vm.stopPrank();

        assertEq(distributor.queuedForOwner(tokenId), 600e6);

        vm.prank(attester);
        ownerReg.attestOwner(tokenId, nftOwner);

        distributor.claimQueued(tokenId);
        assertEq(usdc.balanceOf(nftOwner), 600e6);
    }
}
