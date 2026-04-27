// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {MockReckonRegistrar} from "./MockReckonRegistrar.sol";
import {ReckonErrors} from "../../src/lib/ReckonErrors.sol";

contract MockReckonRegistrarTest is Test {
    MockReckonRegistrar internal reg;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    bytes32 internal aliceNode = keccak256("alice.solvers.reckon.eth");
    bytes32 internal bobNode = keccak256("bob.challengers.reckon.eth");

    function setUp() public {
        reg = new MockReckonRegistrar();
    }

    function test_mint_then_namehash_roundtrip() public {
        reg.mint(alice, aliceNode, MockReckonRegistrar.Role.Solver);
        assertEq(reg.namehashOf(alice), aliceNode);
        assertEq(reg.ownerOfNamehash(aliceNode), alice);
        assertTrue(reg.isRegistered(alice));
    }

    function test_namehashOf_reverts_for_unregistered() public {
        vm.expectRevert(ReckonErrors.NotRegistered.selector);
        reg.namehashOf(alice);
    }

    function test_isRegistered_false_by_default() public view {
        assertFalse(reg.isRegistered(alice));
    }

    function test_mint_reverts_on_duplicate_owner() public {
        reg.mint(alice, aliceNode, MockReckonRegistrar.Role.Solver);
        vm.expectRevert(ReckonErrors.AlreadyRegistered.selector);
        reg.mint(alice, keccak256("other"), MockReckonRegistrar.Role.Challenger);
    }

    function test_mint_reverts_on_duplicate_node() public {
        reg.mint(alice, aliceNode, MockReckonRegistrar.Role.Solver);
        vm.expectRevert(ReckonErrors.LabelTaken.selector);
        reg.mint(bob, aliceNode, MockReckonRegistrar.Role.Solver);
    }

    function test_mint_reverts_on_zero_user() public {
        vm.expectRevert(ReckonErrors.ZeroAddress.selector);
        reg.mint(address(0), aliceNode, MockReckonRegistrar.Role.Solver);
    }

    function test_mint_reverts_on_zero_node() public {
        vm.expectRevert(ReckonErrors.ZeroAddress.selector);
        reg.mint(alice, bytes32(0), MockReckonRegistrar.Role.Solver);
    }

    function test_setText_and_getText_roundtrip() public {
        reg.mint(alice, aliceNode, MockReckonRegistrar.Role.Solver);
        reg.setText(aliceNode, "reckon.reputation", "850000000000000000");
        assertEq(reg.getText(aliceNode, "reckon.reputation"), "850000000000000000");
    }

    function test_getText_returns_empty_when_unset() public view {
        assertEq(reg.getText(aliceNode, "reckon.reputation"), "");
    }
}
