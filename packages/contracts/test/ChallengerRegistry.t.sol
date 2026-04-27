// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/access/Ownable.sol";
import {ChallengerRegistry} from "../src/ChallengerRegistry.sol";
import {IReckonNamehashLookup} from "../src/interfaces/IReckonNamehashLookup.sol";
import {ReckonErrors} from "../src/lib/ReckonErrors.sol";
import {ReckonEvents} from "../src/lib/ReckonEvents.sol";

contract ChallengerRegistryTest is Test {
    ChallengerRegistry internal reg;

    address internal admin = makeAddr("admin");
    address internal relayer = makeAddr("relayer");
    address internal stranger = makeAddr("stranger");
    address internal eve = makeAddr("eve");
    address internal mallory = makeAddr("mallory");

    bytes32 internal eveNode = keccak256("eve.challengers.reckon.eth");
    bytes32 internal malloryNode = keccak256("mallory.challengers.reckon.eth");

    function setUp() public {
        reg = new ChallengerRegistry(admin, relayer);
    }

    // -- constructor --

    function test_constructor_sets_roles() public view {
        assertEq(reg.owner(), admin);
        assertEq(reg.relayer(), relayer);
    }

    function test_constructor_reverts_on_zero_relayer() public {
        vm.expectRevert(ReckonErrors.ZeroAddress.selector);
        new ChallengerRegistry(admin, address(0));
    }

    // -- register --

    function test_register_only_relayer() public {
        vm.prank(stranger);
        vm.expectRevert(ReckonErrors.NotRelayer.selector);
        reg.register(eveNode, eve);
    }

    function test_register_writes_and_emits() public {
        vm.expectEmit(true, true, false, false, address(reg));
        emit ReckonEvents.ChallengerRegistered(eveNode, eve);
        vm.prank(relayer);
        reg.register(eveNode, eve);

        assertEq(reg.ownerOfNamehash(eveNode), eve);
        assertEq(reg.namehashOf(eve), eveNode);
        assertTrue(reg.isRegistered(eve));
    }

    function test_register_rejects_duplicate_owner() public {
        vm.startPrank(relayer);
        reg.register(eveNode, eve);
        vm.expectRevert(ReckonErrors.AlreadyRegistered.selector);
        reg.register(keccak256("other.challengers.reckon.eth"), eve);
        vm.stopPrank();
    }

    function test_register_rejects_duplicate_node() public {
        vm.startPrank(relayer);
        reg.register(eveNode, eve);
        vm.expectRevert(ReckonErrors.LabelTaken.selector);
        reg.register(eveNode, mallory);
        vm.stopPrank();
    }

    function test_register_reverts_on_zero_node() public {
        vm.prank(relayer);
        vm.expectRevert(ReckonErrors.ZeroNode.selector);
        reg.register(bytes32(0), eve);
    }

    function test_register_reverts_on_zero_owner() public {
        vm.prank(relayer);
        vm.expectRevert(ReckonErrors.ZeroAddress.selector);
        reg.register(eveNode, address(0));
    }

    // -- isRegistered --

    function test_isRegistered_false_by_default() public view {
        assertFalse(reg.isRegistered(eve));
    }

    function test_isRegistered_true_after_register() public {
        vm.prank(relayer);
        reg.register(eveNode, eve);
        assertTrue(reg.isRegistered(eve));
    }

    // -- namehashOf --

    function test_namehashOf_reverts_for_unregistered() public {
        vm.expectRevert(ReckonErrors.NotRegistered.selector);
        reg.namehashOf(eve);
    }

    // -- unregister --

    function test_unregister_only_relayer() public {
        vm.prank(relayer);
        reg.register(eveNode, eve);
        vm.prank(stranger);
        vm.expectRevert(ReckonErrors.NotRelayer.selector);
        reg.unregister(eveNode);
    }

    function test_unregister_clears_both_directions() public {
        vm.startPrank(relayer);
        reg.register(eveNode, eve);

        vm.expectEmit(true, false, false, false, address(reg));
        emit ReckonEvents.ChallengerUnregistered(eveNode);
        reg.unregister(eveNode);
        vm.stopPrank();

        assertFalse(reg.isRegistered(eve));
        assertEq(reg.ownerOfNamehash(eveNode), address(0));
    }

    function test_unregister_reverts_on_unknown_node() public {
        vm.prank(relayer);
        vm.expectRevert(ReckonErrors.NotRegistered.selector);
        reg.unregister(eveNode);
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

    // -- interface conformance --

    function test_implements_IReckonNamehashLookup() public {
        // Compile-time conformance check via successful upcast.
        IReckonNamehashLookup lookup = IReckonNamehashLookup(address(reg));
        assertEq(address(lookup), address(reg));
    }
}
