// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {Addresses} from "../src/lib/Addresses.sol";

contract AddressesTest is Test {
    function setUp() public {
        vm.createSelectFork(vm.rpcUrl("base"));
    }

    function test_PriorityOrderReactorHasCode() public view {
        assertGt(Addresses.PRIORITY_ORDER_REACTOR.code.length, 0);
    }

    function test_Permit2HasCode() public view {
        assertGt(Addresses.PERMIT2.code.length, 0);
    }

    function test_V4PoolManagerHasCode() public view {
        assertGt(Addresses.V4_POOL_MANAGER.code.length, 0);
    }

    function test_V4StateViewHasCode() public view {
        assertGt(Addresses.V4_STATE_VIEW.code.length, 0);
    }

    function test_UsdcBaseHasCode() public view {
        assertGt(Addresses.USDC_BASE.code.length, 0);
    }

    function test_WethBaseHasCode() public view {
        assertGt(Addresses.WETH_BASE.code.length, 0);
    }
}
