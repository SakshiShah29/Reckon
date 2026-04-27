// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SolverRegistry} from "../src/SolverRegistry.sol";
import {SolverBondVault} from "../src/SolverBondVault.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {ReckonErrors} from "../src/lib/ReckonErrors.sol";
import {ReckonEvents} from "../src/lib/ReckonEvents.sol";

contract SolverRegistryTest is Test {
    SolverRegistry internal reg;

    address internal admin = makeAddr("admin");
    address internal relayer = makeAddr("relayer");
    address internal stranger = makeAddr("stranger");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    bytes32 internal aliceNode = keccak256("alice.solvers.reckon.eth");
    bytes32 internal bobNode = keccak256("bob.solvers.reckon.eth");

    function setUp() public {
        reg = new SolverRegistry(admin, relayer);
    }

    // -- constructor / config --

    function test_constructor_sets_roles() public view {
        assertEq(reg.owner(), admin);
        assertEq(reg.relayer(), relayer);
    }

    function test_constructor_reverts_on_zero_relayer() public {
        vm.expectRevert(ReckonErrors.ZeroAddress.selector);
        new SolverRegistry(admin, address(0));
    }

    // -- register --

    function test_register_only_relayer() public {
        vm.prank(stranger);
        vm.expectRevert(ReckonErrors.NotRelayer.selector);
        reg.register(aliceNode, alice);
    }

    function test_register_writes_and_emits() public {
        vm.expectEmit(true, true, false, false, address(reg));
        emit ReckonEvents.SolverRegistered(aliceNode, alice);
        vm.prank(relayer);
        reg.register(aliceNode, alice);

        assertEq(reg.ownerOfNamehash(aliceNode), alice);
        assertEq(reg.namehashOf(alice), aliceNode);
        assertTrue(reg.isRegistered(alice));
    }

    function test_register_rejects_duplicate_owner() public {
        vm.startPrank(relayer);
        reg.register(aliceNode, alice);
        vm.expectRevert(ReckonErrors.AlreadyRegistered.selector);
        reg.register(keccak256("other.solvers.reckon.eth"), alice);
        vm.stopPrank();
    }

    function test_register_rejects_duplicate_node() public {
        vm.startPrank(relayer);
        reg.register(aliceNode, alice);
        vm.expectRevert(ReckonErrors.LabelTaken.selector);
        reg.register(aliceNode, bob);
        vm.stopPrank();
    }

    function test_register_reverts_on_zero_node() public {
        vm.prank(relayer);
        vm.expectRevert(ReckonErrors.ZeroNode.selector);
        reg.register(bytes32(0), alice);
    }

    function test_register_reverts_on_zero_owner() public {
        vm.prank(relayer);
        vm.expectRevert(ReckonErrors.ZeroAddress.selector);
        reg.register(aliceNode, address(0));
    }

    // -- unregister --

    function test_unregister_only_relayer() public {
        vm.prank(relayer);
        reg.register(aliceNode, alice);
        vm.prank(stranger);
        vm.expectRevert(ReckonErrors.NotRelayer.selector);
        reg.unregister(aliceNode);
    }

    function test_unregister_clears_both_directions() public {
        vm.startPrank(relayer);
        reg.register(aliceNode, alice);

        vm.expectEmit(true, false, false, false, address(reg));
        emit ReckonEvents.SolverUnregistered(aliceNode);
        reg.unregister(aliceNode);
        vm.stopPrank();

        assertFalse(reg.isRegistered(alice));
        assertEq(reg.ownerOfNamehash(aliceNode), address(0));
    }

    function test_unregister_reverts_on_unknown_node() public {
        vm.prank(relayer);
        vm.expectRevert(ReckonErrors.NotRegistered.selector);
        reg.unregister(aliceNode);
    }

    // -- namehashOf --

    function test_namehashOf_reverts_for_unregistered() public {
        vm.expectRevert(ReckonErrors.NotRegistered.selector);
        reg.namehashOf(alice);
    }

    function test_isRegistered_false_by_default() public view {
        assertFalse(reg.isRegistered(alice));
    }

    // -- setText / getText --

    function test_setText_only_relayer_round_trips() public {
        vm.prank(relayer);
        reg.register(aliceNode, alice);

        vm.prank(stranger);
        vm.expectRevert(ReckonErrors.NotRelayer.selector);
        reg.setText(aliceNode, "reckon.reputation", "1");

        vm.expectEmit(true, false, false, true, address(reg));
        emit ReckonEvents.TextSet(aliceNode, "reckon.reputation", "850000000000000000");
        vm.prank(relayer);
        reg.setText(aliceNode, "reckon.reputation", "850000000000000000");

        assertEq(reg.getText(aliceNode, "reckon.reputation"), "850000000000000000");
    }

    function test_setText_reverts_on_unknown_node() public {
        vm.prank(relayer);
        vm.expectRevert(ReckonErrors.NotRegistered.selector);
        reg.setText(aliceNode, "k", "v");
    }

    function test_getText_returns_empty_when_unset() public {
        vm.prank(relayer);
        reg.register(aliceNode, alice);
        assertEq(reg.getText(aliceNode, "reckon.reputation"), "");
    }

    // -- rotateRelayer --

    function test_rotateRelayer_only_owner() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        reg.rotateRelayer(makeAddr("next"));
    }

    function test_rotateRelayer_reverts_on_zero() public {
        vm.prank(admin);
        vm.expectRevert(ReckonErrors.ZeroAddress.selector);
        reg.rotateRelayer(address(0));
    }

    function test_rotateRelayer_writes_and_emits() public {
        address next = makeAddr("nextRelayer");
        vm.expectEmit(true, true, false, false, address(reg));
        emit ReckonEvents.RelayerRotated(relayer, next);
        vm.prank(admin);
        reg.rotateRelayer(next);
        assertEq(reg.relayer(), next);
    }
}

/// @notice Integration test: production SolverRegistry composed with the
///         existing SolverBondVault. Proves that swapping MockReckonRegistrar
///         for SolverRegistry doesn't break §4's `requiredBond` decay model.
contract SolverRegistry_BondVaultIntegrationTest is Test {
    SolverRegistry internal reg;
    SolverBondVault internal vault;
    MockUSDC internal usdc;

    address internal admin = makeAddr("admin");
    address internal relayer = makeAddr("relayer");
    address internal solver = makeAddr("solver");
    bytes32 internal solverNode = keccak256("solver.solvers.reckon.eth");

    function setUp() public {
        usdc = new MockUSDC();
        reg = new SolverRegistry(admin, relayer);
        vault = new SolverBondVault(admin, IERC20(address(usdc)), reg);
        vm.prank(relayer);
        reg.register(solverNode, solver);
    }

    function test_requiredBond_defaults_to_baseBond() public view {
        // No reputation text set yet → fallback to baseBond (1000 USDC).
        assertEq(vault.requiredBond(solverNode), 1000e6);
    }

    function test_requiredBond_decays_with_reputation_set_via_relayer() public {
        // Mid-decay reputation (0.5 in 1e18 scale) → bond = 1000 - 0.5 * 900 = 550 USDC.
        vm.prank(relayer);
        reg.setText(solverNode, "reckon.reputation", "500000000000000000");
        assertEq(vault.requiredBond(solverNode), 550e6);
    }

    function test_requiredBond_at_max_reputation() public {
        vm.prank(relayer);
        reg.setText(solverNode, "reckon.reputation", "1000000000000000000");
        assertEq(vault.requiredBond(solverNode), 100e6);
    }

    function test_solver_can_deposit_via_production_registry() public {
        usdc.mint(solver, 1000e6);
        vm.startPrank(solver);
        usdc.approve(address(vault), 1000e6);
        vault.deposit(1000e6);
        vm.stopPrank();
        assertEq(vault.bondedAmount(solverNode), 1000e6);
    }

    function test_unregistered_solver_cannot_deposit() public {
        address rando = makeAddr("rando");
        usdc.mint(rando, 1000e6);
        vm.startPrank(rando);
        usdc.approve(address(vault), 1000e6);
        vm.expectRevert(ReckonErrors.NotRegistered.selector);
        vault.deposit(1000e6);
        vm.stopPrank();
    }
}
