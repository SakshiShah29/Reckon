// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/access/Ownable.sol";
import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";
import {SolverBondVault} from "../src/SolverBondVault.sol";
import {MockReckonRegistrar} from "./mocks/MockReckonRegistrar.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {ReckonErrors} from "../src/lib/ReckonErrors.sol";
import {ReckonEvents} from "../src/lib/ReckonEvents.sol";

contract SolverBondVaultTest is Test {
    SolverBondVault internal vault;
    MockReckonRegistrar internal registrar;

    MockUSDC internal usdc;

    address internal admin = makeAddr("admin");
    address internal challenger = makeAddr("challenger");
    address internal fillRegistry = makeAddr("fillRegistry");
    address internal stranger = makeAddr("stranger");
    address internal solver = makeAddr("solver");
    bytes32 internal solverNode = keccak256("solver.solvers.reckon.eth");

    function setUp() public {
        usdc = new MockUSDC();
        registrar = new MockReckonRegistrar();
        vault = new SolverBondVault(admin, IERC20(address(usdc)), registrar);
        registrar.mint(solver, solverNode, MockReckonRegistrar.Role.Solver);
    }

    function _fundAndApprove(address user, uint256 amount) internal {
        usdc.mint(user, amount);
        vm.prank(user);
        usdc.approve(address(vault), amount);
    }

    function test_constructor_sets_immutables_and_defaults() public view {
        assertEq(address(vault.usdc()), address(usdc));
        assertEq(address(vault.registrar()), address(registrar));
        assertEq(vault.owner(), admin);
        assertEq(vault.baseBond(), 1000e6);
        assertEq(vault.floorBond(), 100e6);
        assertEq(vault.challenger(), address(0));
    }

    function test_constructor_reverts_on_zero_usdc() public {
        vm.expectRevert(ReckonErrors.ZeroAddress.selector);
        new SolverBondVault(admin, IERC20(address(0)), registrar);
    }

    function test_constructor_reverts_on_zero_registrar() public {
        vm.expectRevert(ReckonErrors.ZeroAddress.selector);
        new SolverBondVault(admin, usdc, MockReckonRegistrar(address(0)));
    }

    function test_setChallenger_writes_once() public {
        vm.prank(admin);
        vault.setChallenger(challenger);
        assertEq(vault.challenger(), challenger);
    }

    function test_setChallenger_only_owner() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        vault.setChallenger(challenger);
    }

    function test_setChallenger_reverts_on_zero() public {
        vm.prank(admin);
        vm.expectRevert(ReckonErrors.ZeroAddress.selector);
        vault.setChallenger(address(0));
    }

    function test_setChallenger_reverts_on_second_call() public {
        vm.startPrank(admin);
        vault.setChallenger(challenger);
        vm.expectRevert(ReckonErrors.AlreadyInitialized.selector);
        vault.setChallenger(makeAddr("other"));
        vm.stopPrank();
    }

    // -- deposit --

    function test_deposit_pulls_usdc_and_credits_node() public {
        _fundAndApprove(solver, 500e6);

        vm.expectEmit(true, false, false, true, address(vault));
        emit ReckonEvents.BondDeposited(solverNode, 500e6);
        vm.prank(solver);
        vault.deposit(500e6);

        assertEq(vault.bondedAmount(solverNode), 500e6);
        assertEq(usdc.balanceOf(address(vault)), 500e6);
        assertEq(usdc.balanceOf(solver), 0);
    }

    function test_deposit_accumulates() public {
        _fundAndApprove(solver, 1000e6);
        vm.startPrank(solver);
        vault.deposit(300e6);
        vault.deposit(700e6);
        vm.stopPrank();
        assertEq(vault.bondedAmount(solverNode), 1000e6);
    }

    function test_deposit_reverts_for_unregistered_caller() public {
        _fundAndApprove(stranger, 100e6);
        vm.prank(stranger);
        vm.expectRevert(ReckonErrors.NotRegistered.selector);
        vault.deposit(100e6);
    }

    function test_deposit_reverts_when_unapproved() public {
        usdc.mint(solver, 100e6);
        vm.prank(solver);
        vm.expectRevert(); // ERC20: insufficient allowance
        vault.deposit(100e6);
    }

    // -- requiredBond --

    function test_requiredBond_defaults_when_text_unset() public view {
        assertEq(vault.requiredBond(solverNode), 1000e6);
    }

    function test_requiredBond_defaults_when_text_malformed() public {
        registrar.setText(solverNode, "reckon.reputation", "abc");
        assertEq(vault.requiredBond(solverNode), 1000e6);
    }

    function test_requiredBond_at_zero_reputation() public {
        registrar.setText(solverNode, "reckon.reputation", "0");
        assertEq(vault.requiredBond(solverNode), 1000e6);
    }

    function test_requiredBond_at_max_reputation() public {
        registrar.setText(solverNode, "reckon.reputation", "1000000000000000000");
        assertEq(vault.requiredBond(solverNode), 100e6);
    }

    function test_requiredBond_at_half_reputation() public {
        registrar.setText(solverNode, "reckon.reputation", "500000000000000000");
        // baseBond - 0.5 * (baseBond - floorBond) = 1000 - 450 = 550 USDC
        assertEq(vault.requiredBond(solverNode), 550e6);
    }

    function test_requiredBond_above_max_clamps_to_floor() public {
        registrar.setText(solverNode, "reckon.reputation", "9999999999999999999");
        assertEq(vault.requiredBond(solverNode), 100e6);
    }

    function testFuzz_requiredBond_monotonic_decay(uint256 rep) public {
        rep = bound(rep, 0, 1e18);
        registrar.setText(solverNode, "reckon.reputation", vm.toString(rep));
        uint256 result = vault.requiredBond(solverNode);
        assertGe(result, 100e6);
        assertLe(result, 1000e6);
    }

    // -- lock / unlock / slash / withdraw --

    function _depositAndWireChallenger() internal {
        _fundAndApprove(solver, 1000e6);
        vm.prank(solver);
        vault.deposit(1000e6);
        vm.prank(admin);
        vault.setChallenger(challenger);
    }

    function test_lock_only_challenger() public {
        _depositAndWireChallenger();
        vm.prank(stranger);
        vm.expectRevert(ReckonErrors.NotChallenger.selector);
        vault.lock(solverNode, 100e6);
    }

    function test_lock_writes_and_emits() public {
        _depositAndWireChallenger();
        vm.expectEmit(true, false, false, true, address(vault));
        emit ReckonEvents.BondLocked(solverNode, 400e6);
        vm.prank(challenger);
        vault.lock(solverNode, 400e6);
        assertEq(vault.lockedAmount(solverNode), 400e6);
    }

    function test_lock_reverts_when_insufficient_bond() public {
        _depositAndWireChallenger();
        vm.prank(challenger);
        vm.expectRevert(ReckonErrors.InsufficientBond.selector);
        vault.lock(solverNode, 1001e6);
    }

    function test_unlock_only_challenger() public {
        _depositAndWireChallenger();
        vm.prank(stranger);
        vm.expectRevert(ReckonErrors.NotChallenger.selector);
        vault.unlock(solverNode, 1);
    }

    function test_unlock_decrements() public {
        _depositAndWireChallenger();
        vm.startPrank(challenger);
        vault.lock(solverNode, 500e6);
        vault.unlock(solverNode, 200e6);
        vm.stopPrank();
        assertEq(vault.lockedAmount(solverNode), 300e6);
    }

    function test_unlock_reverts_when_exceeds_locked() public {
        _depositAndWireChallenger();
        vm.startPrank(challenger);
        vault.lock(solverNode, 100e6);
        vm.expectRevert(ReckonErrors.AmountLocked.selector);
        vault.unlock(solverNode, 200e6);
        vm.stopPrank();
    }

    function test_slash_only_challenger() public {
        _depositAndWireChallenger();
        vm.prank(stranger);
        vm.expectRevert(ReckonErrors.NotChallenger.selector);
        vault.slash(solverNode, 100e6, makeAddr("recipient"));
    }

    function test_slash_reverts_on_zero_recipient() public {
        _depositAndWireChallenger();
        vm.prank(challenger);
        vm.expectRevert(ReckonErrors.ZeroAddress.selector);
        vault.slash(solverNode, 100e6, address(0));
    }

    function test_slash_transfers_and_decrements() public {
        _depositAndWireChallenger();
        address recipient = makeAddr("recipient");
        vm.prank(challenger);
        uint256 actual = vault.slash(solverNode, 250e6, recipient);
        assertEq(actual, 250e6);
        assertEq(vault.bondedAmount(solverNode), 750e6);
        assertEq(usdc.balanceOf(recipient), 250e6);
    }

    function test_slash_caps_at_bonded() public {
        _depositAndWireChallenger();
        address recipient = makeAddr("recipient");
        vm.prank(challenger);
        uint256 actual = vault.slash(solverNode, 5000e6, recipient);
        assertEq(actual, 1000e6);
        assertEq(vault.bondedAmount(solverNode), 0);
        assertEq(usdc.balanceOf(recipient), 1000e6);
    }

    function test_slash_decrements_locked_partially() public {
        _depositAndWireChallenger();
        vm.startPrank(challenger);
        vault.lock(solverNode, 600e6);
        uint256 actual = vault.slash(solverNode, 200e6, makeAddr("r"));
        vm.stopPrank();
        assertEq(actual, 200e6);
        assertEq(vault.lockedAmount(solverNode), 400e6);
        assertEq(vault.bondedAmount(solverNode), 800e6);
    }

    function test_slash_clamps_locked_when_actual_exceeds_locked() public {
        _depositAndWireChallenger();
        vm.startPrank(challenger);
        vault.lock(solverNode, 100e6);
        uint256 actual = vault.slash(solverNode, 500e6, makeAddr("r"));
        vm.stopPrank();
        assertEq(actual, 500e6);
        assertEq(vault.lockedAmount(solverNode), 0);
        assertEq(vault.bondedAmount(solverNode), 500e6);
    }

    function test_slash_zero_when_no_bond() public {
        vm.prank(admin);
        vault.setChallenger(challenger);
        vm.prank(challenger);
        uint256 actual = vault.slash(solverNode, 100e6, makeAddr("r"));
        assertEq(actual, 0);
    }

    function test_withdrawable_returns_unlocked_portion() public {
        _depositAndWireChallenger();
        vm.prank(challenger);
        vault.lock(solverNode, 300e6);
        assertEq(vault.withdrawable(solverNode), 700e6);
    }

    function test_withdraw_succeeds_for_unlocked_portion() public {
        _depositAndWireChallenger();
        vm.prank(challenger);
        vault.lock(solverNode, 300e6);

        vm.expectEmit(true, true, false, true, address(vault));
        emit ReckonEvents.BondWithdrawn(solverNode, solver, 700e6);
        vm.prank(solver);
        vault.withdraw(700e6);

        assertEq(vault.bondedAmount(solverNode), 300e6);
        assertEq(vault.lockedAmount(solverNode), 300e6);
        assertEq(usdc.balanceOf(solver), 700e6);
    }

    function test_withdraw_reverts_when_locked() public {
        _depositAndWireChallenger();
        vm.prank(challenger);
        vault.lock(solverNode, 800e6);

        vm.prank(solver);
        vm.expectRevert(ReckonErrors.AmountLocked.selector);
        vault.withdraw(300e6);
    }

    function test_withdraw_reverts_for_unregistered_caller() public {
        vm.prank(stranger);
        vm.expectRevert(ReckonErrors.NotRegistered.selector);
        vault.withdraw(1);
    }

    // -- setFillRegistry / lockOnFill / unlockOnFill --

    function _wireFillRegistry() internal {
        vm.prank(admin);
        vault.setFillRegistry(fillRegistry);
    }

    function test_setFillRegistry_writes_once() public {
        _wireFillRegistry();
        assertEq(vault.fillRegistry(), fillRegistry);
    }

    function test_setFillRegistry_only_owner() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        vault.setFillRegistry(fillRegistry);
    }

    function test_setFillRegistry_reverts_on_zero() public {
        vm.prank(admin);
        vm.expectRevert(ReckonErrors.ZeroAddress.selector);
        vault.setFillRegistry(address(0));
    }

    function test_setFillRegistry_reverts_on_second_call() public {
        vm.startPrank(admin);
        vault.setFillRegistry(fillRegistry);
        vm.expectRevert(ReckonErrors.AlreadyInitialized.selector);
        vault.setFillRegistry(makeAddr("other"));
        vm.stopPrank();
    }

    function test_lockOnFill_only_fillRegistry() public {
        _wireFillRegistry();
        vm.prank(stranger);
        vm.expectRevert(ReckonErrors.NotFillRegistry.selector);
        vault.lockOnFill(solverNode);
    }

    function test_lockOnFill_increments_counter() public {
        _wireFillRegistry();

        vm.expectEmit(true, false, false, true, address(vault));
        emit ReckonEvents.FillLocked(solverNode, 1);
        vm.prank(fillRegistry);
        vault.lockOnFill(solverNode);
        assertEq(vault.openFillCount(solverNode), 1);

        vm.prank(fillRegistry);
        vault.lockOnFill(solverNode);
        assertEq(vault.openFillCount(solverNode), 2);
    }

    function test_unlockOnFill_only_fillRegistry() public {
        _wireFillRegistry();
        vm.prank(stranger);
        vm.expectRevert(ReckonErrors.NotFillRegistry.selector);
        vault.unlockOnFill(solverNode);
    }

    function test_unlockOnFill_decrements() public {
        _wireFillRegistry();
        vm.startPrank(fillRegistry);
        vault.lockOnFill(solverNode);
        vault.lockOnFill(solverNode);

        vm.expectEmit(true, false, false, true, address(vault));
        emit ReckonEvents.FillUnlocked(solverNode, 1);
        vault.unlockOnFill(solverNode);
        vm.stopPrank();

        assertEq(vault.openFillCount(solverNode), 1);
    }

    function test_unlockOnFill_reverts_on_underflow() public {
        _wireFillRegistry();
        vm.prank(fillRegistry);
        vm.expectRevert(ReckonErrors.CounterUnderflow.selector);
        vault.unlockOnFill(solverNode);
    }

    function test_withdraw_reverts_when_openFills_present() public {
        _depositAndWireChallenger();
        _wireFillRegistry();
        vm.prank(fillRegistry);
        vault.lockOnFill(solverNode);

        vm.prank(solver);
        vm.expectRevert(ReckonErrors.OpenFillsPending.selector);
        vault.withdraw(100e6);
    }

    function test_withdraw_succeeds_after_all_fills_unlocked() public {
        _depositAndWireChallenger();
        _wireFillRegistry();

        vm.startPrank(fillRegistry);
        vault.lockOnFill(solverNode);
        vault.lockOnFill(solverNode);
        vault.unlockOnFill(solverNode);
        vault.unlockOnFill(solverNode);
        vm.stopPrank();

        assertEq(vault.openFillCount(solverNode), 0);
        vm.prank(solver);
        vault.withdraw(500e6);
        assertEq(usdc.balanceOf(solver), 500e6);
    }

    function test_openFillCount_independent_of_amount_lock() public {
        // openFillCount and lockedAmount are independent — counter can be 0 while
        // a live challenge holds an amount lock, and vice versa.
        _depositAndWireChallenger();
        _wireFillRegistry();

        vm.prank(challenger);
        vault.lock(solverNode, 200e6);
        assertEq(vault.lockedAmount(solverNode), 200e6);
        assertEq(vault.openFillCount(solverNode), 0);

        vm.prank(fillRegistry);
        vault.lockOnFill(solverNode);
        assertEq(vault.lockedAmount(solverNode), 200e6);
        assertEq(vault.openFillCount(solverNode), 1);
    }
}
