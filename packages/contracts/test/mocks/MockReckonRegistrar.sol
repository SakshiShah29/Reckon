// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IReckonRegistrar} from "../../src/interfaces/IReckonRegistrar.sol";
import {ReckonErrors} from "../../src/lib/ReckonErrors.sol";

/// @title MockReckonRegistrar
/// @notice Test-only implementation of IReckonRegistrar. Seeds owner⇆node mappings
///         via `mint(...)`. Never deployed to a chain. Production registrar is a
///         Phase 0 contingency (Durin/Namestone or in-house — see guide §3.2).
contract MockReckonRegistrar is IReckonRegistrar {
    enum Role {
        None,
        Solver,
        Challenger
    }

    mapping(bytes32 node => address) public _ownerOfNode;
    mapping(address owner => bytes32 node) public _nodeOfOwner;
    mapping(bytes32 node => Role) public _roleOf;
    mapping(bytes32 node => mapping(string key => string)) internal _texts;

    /// @notice Test helper: assign `node` (and `role`) to `user`. One subname per address.
    function mint(address user, bytes32 node, Role role) external {
        if (user == address(0) || node == bytes32(0)) revert ReckonErrors.ZeroAddress();
        if (_nodeOfOwner[user] != bytes32(0)) revert ReckonErrors.AlreadyRegistered();
        if (_ownerOfNode[node] != address(0)) revert ReckonErrors.LabelTaken();
        _ownerOfNode[node] = user;
        _nodeOfOwner[user] = node;
        _roleOf[node] = role;
    }

    function namehashOf(address owner) external view returns (bytes32) {
        bytes32 node = _nodeOfOwner[owner];
        if (node == bytes32(0)) revert ReckonErrors.NotRegistered();
        return node;
    }

    function ownerOfNamehash(bytes32 node) external view returns (address) {
        return _ownerOfNode[node];
    }

    function isRegistered(address owner) external view returns (bool) {
        return _nodeOfOwner[owner] != bytes32(0);
    }

    /// @dev No auth in the mock — tests own all the state. Production gates on
    ///      node owner OR a trusted reputation writer.
    function setText(bytes32 node, string calldata key, string calldata value) external {
        _texts[node][key] = value;
    }

    function getText(bytes32 node, string calldata key) external view returns (string memory) {
        return _texts[node][key];
    }
}
