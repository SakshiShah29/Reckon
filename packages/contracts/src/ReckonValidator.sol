// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IValidationCallback} from "uniswapx/interfaces/IValidationCallback.sol";
import {ResolvedOrder} from "uniswapx/base/ReactorStructs.sol";
import {IReckonRegistrar} from "./interfaces/IReckonRegistrar.sol";
import {ReckonErrors} from "./lib/ReckonErrors.sol";

/// @title ReckonValidator
/// @notice UniswapX `additionalValidationContract` for Reckon-protected orders.
///         View-only by interface contract — performs solver-registration gating
///         and `eboTolerance` sanity-checking, then returns silently.
/// @dev Fill recording happens off-chain via the relayer subscribing to the
///      reactor's `Fill` event. This contract never writes state.
contract ReckonValidator is IValidationCallback {
    IReckonRegistrar public immutable solverRegistry;

    constructor(IReckonRegistrar _solverRegistry) {
        if (address(_solverRegistry) == address(0)) revert ReckonErrors.ZeroAddress();
        solverRegistry = _solverRegistry;
    }

    /// @inheritdoc IValidationCallback
    function validate(address filler, ResolvedOrder calldata order) external view {
        if (!solverRegistry.isRegistered(filler)) revert ReckonErrors.NotRegistered();

        bytes calldata data = order.info.additionalValidationData;
        if (data.length != 32) revert ReckonErrors.InvalidValidationData();

        uint16 eboTolerance = abi.decode(data, (uint16));
        if (eboTolerance > 10_000) revert ReckonErrors.ToleranceTooHigh();
    }
}
