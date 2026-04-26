// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";

contract ForkSanityTest is Test {
    address constant PRIORITY_ORDER_REACTOR = 0x000000001Ec5656dcdB24D90DFa42742738De729;
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address constant V4_POOL_MANAGER = 0x498581fF718922c3f8e6A244956aF099B2652b2b;

    function setUp() public {
        vm.createSelectFork(vm.rpcUrl("base"));
    }

    function test_ForkSeesPriorityOrderReactor() public view {
        assertGt(PRIORITY_ORDER_REACTOR.code.length, 0, "reactor bytecode missing");
    }

    function test_ForkSeesPermit2() public view {
        assertGt(PERMIT2.code.length, 0, "permit2 bytecode missing");
    }

    function test_ForkSeesV4PoolManager() public view {
        assertGt(V4_POOL_MANAGER.code.length, 0, "v4 pool manager bytecode missing");
    }
}
