// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title IReckonRegistrar
/// @notice The Reckon-controlled registrar surface used by the validator, vault,
///         challenger, and reputation writer. Insulates downstream contracts from
///         ENS internals so we can swap implementations (in-house ↔ Durin/Namestone)
///         behind a stable interface.
interface IReckonRegistrar {
    /// @notice Returns the namehash of the subname owned by `owner`.
    /// @dev Reverts if `owner` has no subname registered. One subname per address.
    function namehashOf(address owner) external view returns (bytes32);

    /// @notice Returns the address that registered the subname identified by `node`.
    function ownerOfNamehash(bytes32 node) external view returns (address);

    /// @notice Returns true iff `owner` has registered a subname.
    function isRegistered(address owner) external view returns (bool);

    /// @notice Writes a text record. Callable by the node owner OR the trusted
    ///         reputation writer set at construction.
    function setText(bytes32 node, string calldata key, string calldata value) external;

    /// @notice Reads a text record. Returns empty string if unset.
    function getText(bytes32 node, string calldata key) external view returns (string memory);

    /// @notice True iff the two nodes resolve to the same owner address.
    function isSameOwner(bytes32 nodeA, bytes32 nodeB) external view returns (bool);
}
