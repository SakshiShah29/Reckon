// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IReckonNamehashLookup} from "./IReckonNamehashLookup.sol";

/// @title IReckonRegistrar
/// @notice Lookup + text-record surface used by SolverBondVault and the off-chain
///         reputation flush pipeline. Implemented by `SolverRegistry`. Extends
///         `IReckonNamehashLookup` so callers that only need the lookup half
///         (e.g. `ReckonValidator`) can take the smaller type.
/// @dev v0.9 dropped `isSameOwner` — self-challenge is now a pure namehash
///      inequality check (challengerNode != fillerNamehash), made trivial by
///      disjoint solver/challenger parent nodes.
interface IReckonRegistrar is IReckonNamehashLookup {
    /// @notice Writes a text record. Implementation gates on the registrar's
    ///         own auth model (relayer-only in production, open in the mock).
    function setText(bytes32 node, string calldata key, string calldata value) external;

    /// @notice Reads a text record. Returns empty string if unset.
    function getText(bytes32 node, string calldata key) external view returns (string memory);
}
