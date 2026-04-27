// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title IReckonNamehashLookup
/// @notice Minimal lookup surface — namehash ⇄ owner round-trip plus an
///         address-keyed registration check. Implemented by both `SolverRegistry`
///         and `ChallengerRegistry`. The text-record half lives in `IReckonRegistrar`,
///         which extends this interface and is implemented only by `SolverRegistry`.
interface IReckonNamehashLookup {
    /// @notice Returns the namehash of the subname owned by `owner`.
    /// @dev Reverts if `owner` has no subname registered. One subname per address.
    function namehashOf(address owner) external view returns (bytes32);

    /// @notice Returns the address that registered the subname identified by `node`.
    function ownerOfNamehash(bytes32 node) external view returns (address);

    /// @notice Returns true iff `owner` has registered a subname.
    function isRegistered(address owner) external view returns (bool);
}
