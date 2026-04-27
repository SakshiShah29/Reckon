// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {OwnerRegistry} from "../src/OwnerRegistry.sol";
import {ReckonErrors} from "../src/lib/ReckonErrors.sol";
import {ReckonEvents} from "../src/lib/ReckonEvents.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract OwnerRegistryTest is Test {
    OwnerRegistry internal registry;
    address internal admin = makeAddr("admin");
    address internal attester = makeAddr("attester");
    address internal stranger = makeAddr("stranger");

    function setUp() public {
        registry = new OwnerRegistry(admin, attester);
    }

    function test_constructor_sets_roles() public view {
        assertEq(registry.owner(), admin);
        assertEq(registry.attester(), attester);
    }

    function test_constructor_reverts_on_zero_owner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new OwnerRegistry(address(0), attester);
    }

    function test_constructor_reverts_on_zero_attester() public {
        vm.expectRevert(ReckonErrors.ZeroAddress.selector);
        new OwnerRegistry(admin, address(0));
    }

    function test_rotateAttester_only_owner() public {
        address next = makeAddr("nextAttester");
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        registry.rotateAttester(next);
    }

    function test_rotateAttester_emits_and_writes() public {
        address next = makeAddr("nextAttester");
        vm.expectEmit(true, true, false, false, address(registry));
        emit ReckonEvents.AttesterRotated(attester, next);
        vm.prank(admin);
        registry.rotateAttester(next);
        assertEq(registry.attester(), next);
    }

    function test_rotateAttester_reverts_on_zero() public {
        vm.prank(admin);
        vm.expectRevert(ReckonErrors.ZeroAddress.selector);
        registry.rotateAttester(address(0));
    }

    // -- attestOwner / ownerOf / freshnessOf / isStale --

    function test_attestOwner_only_attester() public {
        address holder = makeAddr("holder");
        vm.prank(stranger);
        vm.expectRevert(ReckonErrors.NotAttester.selector);
        registry.attestOwner(1, holder);
    }

    function test_attestOwner_reverts_on_zero_owner() public {
        vm.prank(attester);
        vm.expectRevert(ReckonErrors.ZeroAddress.selector);
        registry.attestOwner(1, address(0));
    }

    function test_attestOwner_writes_and_emits() public {
        address holder = makeAddr("holder");
        vm.warp(1_700_000_000);
        vm.expectEmit(true, true, false, true, address(registry));
        emit ReckonEvents.OwnerAttested(42, holder, uint64(block.timestamp));
        vm.prank(attester);
        registry.attestOwner(42, holder);

        assertEq(registry.ownerOf(42), holder);
        assertEq(registry.freshnessOf(42), 0);
    }

    function test_ownerOf_reverts_if_never_attested() public {
        vm.expectRevert(ReckonErrors.NeverAttested.selector);
        registry.ownerOf(99);
    }

    function test_freshnessOf_reverts_if_never_attested() public {
        vm.expectRevert(ReckonErrors.NeverAttested.selector);
        registry.freshnessOf(99);
    }

    function test_freshnessOf_after_warp() public {
        address holder = makeAddr("holder");
        vm.warp(1_700_000_000);
        vm.prank(attester);
        registry.attestOwner(7, holder);
        vm.warp(block.timestamp + 3600);
        assertEq(registry.freshnessOf(7), 3600);
    }

    function test_isStale_returns_true_when_never_attested() public view {
        assertTrue(registry.isStale(123, 1 days));
    }

    function test_isStale_after_24h() public {
        address holder = makeAddr("holder");
        vm.warp(1_700_000_000);
        vm.prank(attester);
        registry.attestOwner(7, holder);
        vm.warp(block.timestamp + 1 days + 1);
        assertTrue(registry.isStale(7, 1 days));
    }

    function test_isStale_within_24h() public {
        address holder = makeAddr("holder");
        vm.warp(1_700_000_000);
        vm.prank(attester);
        registry.attestOwner(7, holder);
        vm.warp(block.timestamp + 1 days - 1);
        assertFalse(registry.isStale(7, 1 days));
    }

    function test_attestOwner_overwrites_previous() public {
        address h1 = makeAddr("h1");
        address h2 = makeAddr("h2");
        vm.warp(1_700_000_000);
        vm.startPrank(attester);
        registry.attestOwner(5, h1);
        vm.warp(block.timestamp + 100);
        registry.attestOwner(5, h2);
        vm.stopPrank();
        assertEq(registry.ownerOf(5), h2);
        assertEq(registry.freshnessOf(5), 0);
    }
}
