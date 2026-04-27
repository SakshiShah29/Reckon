// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IReckonRegistrar} from "./interfaces/IReckonRegistrar.sol";
import {ReckonErrors} from "./lib/ReckonErrors.sol";
import {ReckonEvents} from "./lib/ReckonEvents.sol";

/// @title SolverRegistry
/// @notice Production on-chain mirror of the `solvers.reckon.eth` namespace.
///         Holds per-subname namehash⇄owner mappings plus text records that
///         drive `SolverBondVault.requiredBond`. Written exclusively by the
///         relayer EOA (which mirrors MongoDB state on-chain via `register`,
///         `unregister`, and `setText`).
/// @dev Implements the full `IReckonRegistrar` interface so `SolverBondVault`
///      and `ReckonValidator` can swap from `MockReckonRegistrar` to this
///      contract at deploy time without touching their own source.
contract SolverRegistry is IReckonRegistrar, Ownable {
    address public relayer;

    mapping(bytes32 node => address) internal _ownerOfNode;
    mapping(address owner => bytes32) internal _nodeOfOwner;
    mapping(bytes32 node => mapping(string key => string value)) internal _texts;

    modifier onlyRelayer() {
        if (msg.sender != relayer) revert ReckonErrors.NotRelayer();
        _;
    }

    constructor(address initialOwner, address initialRelayer) Ownable(initialOwner) {
        if (initialRelayer == address(0)) revert ReckonErrors.ZeroAddress();
        relayer = initialRelayer;
    }

    // -- relayer-gated mutators --

    /// @notice Mirror a new subname registration on-chain. Relayer only.
    ///         Enforces one subname per address and one owner per node.
    function register(bytes32 node, address solverOwner) external onlyRelayer {
        if (node == bytes32(0)) revert ReckonErrors.ZeroNode();
        if (solverOwner == address(0)) revert ReckonErrors.ZeroAddress();
        if (_nodeOfOwner[solverOwner] != bytes32(0)) revert ReckonErrors.AlreadyRegistered();
        if (_ownerOfNode[node] != address(0)) revert ReckonErrors.LabelTaken();

        _ownerOfNode[node] = solverOwner;
        _nodeOfOwner[solverOwner] = node;
        emit ReckonEvents.SolverRegistered(node, solverOwner);
    }

    /// @notice Drop a subname. Relayer only.
    function unregister(bytes32 node) external onlyRelayer {
        address current = _ownerOfNode[node];
        if (current == address(0)) revert ReckonErrors.NotRegistered();
        delete _ownerOfNode[node];
        delete _nodeOfOwner[current];
        emit ReckonEvents.SolverUnregistered(node);
    }

    /// @notice Write a text record on a subname. Relayer only.
    /// @dev Used by the daily KeeperHub flush workflow to push reputation
    ///      aggregates (`reckon.reputation`, `reckon.totalFills`, etc.).
    function setText(bytes32 node, string calldata key, string calldata value) external onlyRelayer {
        if (_ownerOfNode[node] == address(0)) revert ReckonErrors.NotRegistered();
        _texts[node][key] = value;
        emit ReckonEvents.TextSet(node, key, value);
    }

    /// @notice Rotate the relayer EOA. Owner only.
    function rotateRelayer(address next) external onlyOwner {
        if (next == address(0)) revert ReckonErrors.ZeroAddress();
        emit ReckonEvents.RelayerRotated(relayer, next);
        relayer = next;
    }

    // -- IReckonRegistrar (lookup + text reads) --

    function namehashOf(address subnameOwner) external view returns (bytes32) {
        bytes32 node = _nodeOfOwner[subnameOwner];
        if (node == bytes32(0)) revert ReckonErrors.NotRegistered();
        return node;
    }

    function ownerOfNamehash(bytes32 node) external view returns (address) {
        return _ownerOfNode[node];
    }

    function isRegistered(address subnameOwner) external view returns (bool) {
        return _nodeOfOwner[subnameOwner] != bytes32(0);
    }

    function getText(bytes32 node, string calldata key) external view returns (string memory) {
        return _texts[node][key];
    }
}
