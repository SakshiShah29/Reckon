// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {ReckonValidator} from "../src/ReckonValidator.sol";
import {MockReckonRegistrar} from "./mocks/MockReckonRegistrar.sol";
import {ReckonErrors} from "../src/lib/ReckonErrors.sol";

import {ResolvedOrder, OrderInfo, InputToken, OutputToken} from "uniswapx/base/ReactorStructs.sol";
import {IReactor} from "uniswapx/interfaces/IReactor.sol";
import {IValidationCallback} from "uniswapx/interfaces/IValidationCallback.sol";
import {ERC20} from "solmate/src/tokens/ERC20.sol";

contract ReckonValidatorTest is Test {
    ReckonValidator internal validator;
    MockReckonRegistrar internal registrar;

    address internal solver = makeAddr("solver");
    address internal stranger = makeAddr("stranger");
    address internal swapper = makeAddr("swapper");
    bytes32 internal solverNode = keccak256("solver.solvers.reckon.eth");

    function setUp() public {
        registrar = new MockReckonRegistrar();
        validator = new ReckonValidator(registrar);
        registrar.mint(solver, solverNode, MockReckonRegistrar.Role.Solver);
    }

    // -- helpers --

    function _order(bytes memory validationData) internal view returns (ResolvedOrder memory) {
        OrderInfo memory info = OrderInfo({
            reactor: IReactor(address(0)),
            swapper: swapper,
            nonce: 0,
            deadline: type(uint256).max,
            additionalValidationContract: IValidationCallback(address(validator)),
            additionalValidationData: validationData
        });
        InputToken memory input = InputToken({token: ERC20(address(0)), amount: 0, maxAmount: 0});
        OutputToken[] memory outputs = new OutputToken[](1);
        outputs[0] = OutputToken({token: address(0), amount: 0, recipient: swapper});
        return ResolvedOrder({info: info, input: input, outputs: outputs, sig: hex"", hash: bytes32(0)});
    }

    function _validData(uint16 toleranceBps) internal pure returns (bytes memory) {
        return abi.encode(toleranceBps);
    }

    // -- constructor --

    function test_constructor_sets_registry() public view {
        assertEq(address(validator.solverRegistry()), address(registrar));
    }

    function test_constructor_reverts_on_zero_registry() public {
        vm.expectRevert(ReckonErrors.ZeroAddress.selector);
        new ReckonValidator(MockReckonRegistrar(address(0)));
    }

    // -- validate happy path --

    function test_validate_succeeds_for_registered_filler_with_valid_data() public view {
        validator.validate(solver, _order(_validData(50))); // 0.5%
    }

    function test_validate_succeeds_at_zero_tolerance() public view {
        validator.validate(solver, _order(_validData(0)));
    }

    function test_validate_succeeds_at_max_tolerance() public view {
        validator.validate(solver, _order(_validData(10_000)));
    }

    // -- validate revert paths --

    function test_validate_reverts_unregistered_filler() public {
        vm.expectRevert(ReckonErrors.NotRegistered.selector);
        validator.validate(stranger, _order(_validData(50)));
    }

    function test_validate_reverts_on_empty_validation_data() public {
        vm.expectRevert(ReckonErrors.InvalidValidationData.selector);
        validator.validate(solver, _order(""));
    }

    function test_validate_reverts_on_too_short_validation_data() public {
        vm.expectRevert(ReckonErrors.InvalidValidationData.selector);
        validator.validate(solver, _order(hex"1234"));
    }

    function test_validate_reverts_on_too_long_validation_data() public {
        // abi.encode(uint16, uint16) is 64 bytes — wrong length, should reject
        bytes memory tooLong = abi.encode(uint16(50), uint16(100));
        vm.expectRevert(ReckonErrors.InvalidValidationData.selector);
        validator.validate(solver, _order(tooLong));
    }

    function test_validate_reverts_on_tolerance_above_10000bps() public {
        vm.expectRevert(ReckonErrors.ToleranceTooHigh.selector);
        validator.validate(solver, _order(_validData(10_001)));
    }

    // -- gas budget (NFR-1: ≤30k) --

    function test_validate_under_30k_gas() public view {
        ResolvedOrder memory order = _order(_validData(50));
        uint256 gasBefore = gasleft();
        validator.validate(solver, order);
        uint256 gasUsed = gasBefore - gasleft();
        assertLt(gasUsed, 30_000, "validate exceeded 30k gas budget");
    }
}
