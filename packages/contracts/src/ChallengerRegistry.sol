// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable} from "@openzeppelin/access/Ownable.sol";
import {IReckonNamehashLookup} from "./interfaces/IReckonNamehashLookup.sol";
import {ReckonErrors} from "./lib/ReckonErrors.sol";
import {ReckonEvents} from "./lib/ReckonEvents.sol";

/// @title ChallengerRegistry
/// @notice Production on-chain mirror of the `challengers.reckon.eth` namespace.
///         Smaller surface than `SolverRegistry` — challengers don't carry
///         on-chain reputation, so no text records. Implements only the
///         `IReckonNamehashLookup` half of the registrar interface.
contract ChallengerRegistry is IReckonNamehashLookup, Ownable {
    address public relayer;

    mapping(bytes32 node => address) internal _ownerOfNode;
    mapping(address owner => bytes32) internal _nodeOfOwner;

    modifier onlyRelayer() {
        if (msg.sender != relayer) revert ReckonErrors.NotRelayer();
        _;
    }

    constructor(address initialOwner, address initialRelayer) Ownable(initialOwner) {
        if (initialRelayer == address(0)) revert ReckonErrors.ZeroAddress();
        relayer = initialRelayer;
    }

    // -- relayer-gated mutators --

    /// @notice Mirror a new challenger subname registration on-chain. Relayer only.
    function register(bytes32 node, address challengerOwner) external onlyRelayer {
        if (node == bytes32(0)) revert ReckonErrors.ZeroNode();
        if (challengerOwner == address(0)) revert ReckonErrors.ZeroAddress();
        if (_nodeOfOwner[challengerOwner] != bytes32(0)) revert ReckonErrors.AlreadyRegistered();
        if (_ownerOfNode[node] != address(0)) revert ReckonErrors.LabelTaken();

        _ownerOfNode[node] = challengerOwner;
        _nodeOfOwner[challengerOwner] = node;
        emit ReckonEvents.ChallengerRegistered(node, challengerOwner);
    }

    /// @notice Drop a challenger subname. Relayer only.
    function unregister(bytes32 node) external onlyRelayer {
        address current = _ownerOfNode[node];
        if (current == address(0)) revert ReckonErrors.NotRegistered();
        delete _ownerOfNode[node];
        delete _nodeOfOwner[current];
        emit ReckonEvents.ChallengerUnregistered(node);
    }

    /// @notice Rotate the relayer EOA. Owner only.
    function rotateRelayer(address next) external onlyOwner {
        if (next == address(0)) revert ReckonErrors.ZeroAddress();
        emit ReckonEvents.RelayerRotated(relayer, next);
        relayer = next;
    }

    // -- IReckonNamehashLookup --

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
}
