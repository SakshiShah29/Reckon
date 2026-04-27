// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title ReckonEvents
/// @notice Cross-contract event signatures. Indexed where the off-chain indexer
///         filters on the topic; keeps relayer subscriptions stable as contracts evolve.
library ReckonEvents {
    // Registrars (Solver / Challenger production registrars on Base)
    event SolverRegistered(bytes32 indexed node, address indexed owner);
    event SolverUnregistered(bytes32 indexed node);
    event ChallengerRegistered(bytes32 indexed node, address indexed owner);
    event ChallengerUnregistered(bytes32 indexed node);
    event TextSet(bytes32 indexed node, string key, string value);
    event RelayerRotated(address indexed prev, address indexed next);

    // FillRegistry
    event FillRecorded(
        bytes32 indexed orderHash,
        bytes32 indexed fillerNamehash,
        address indexed swapper,
        uint64 fillBlock
    );
    event FillBatchAnchored(
        bytes32 indexed rootHash,
        bytes32 firstOrderHash,
        bytes32 lastOrderHash
    );
    event FillSlashedMarked(bytes32 indexed orderHash);

    // SolverBondVault
    event BondDeposited(bytes32 indexed node, uint256 amount);
    event BondLocked(bytes32 indexed node, uint256 amount);
    event BondUnlocked(bytes32 indexed node, uint256 amount);
    event BondSlashed(bytes32 indexed node, uint256 amount, address to);
    event BondWithdrawn(bytes32 indexed node, address indexed to, uint256 amount);
    event FillLocked(bytes32 indexed node, uint256 newOpenFillCount);
    event FillUnlocked(bytes32 indexed node, uint256 newOpenFillCount);

    // Challenger
    event ChallengeSubmitted(
        bytes32 indexed orderHash,
        bytes32 indexed challengerNode,
        uint256 agentTokenId,
        uint256 challengerBond
    );
    event ChallengeSucceeded(bytes32 indexed orderHash, uint256 slashAmount);
    event ChallengeFailed(bytes32 indexed orderHash, address challenger);

    // RoyaltyDistributor
    event RoyaltyPaid(
        uint256 indexed tokenId,
        address indexed swapper,
        uint256 swapperAmt,
        uint256 ownerAmt,
        uint256 protocolAmt
    );
    event RoyaltyQueued(uint256 indexed tokenId, uint256 amount);
    event RoyaltyClaimed(uint256 indexed tokenId, address indexed owner, uint256 amount);

    // OwnerRegistry
    event OwnerAttested(uint256 indexed tokenId, address indexed owner, uint64 attestedAt);
    event AttesterRotated(address indexed prev, address indexed next);

    // ENSReputationWriter
    event ReputationFlushed(bytes32 indexed node, uint256 newReputation);

    // EBBOOracle
    event PoolListProposed(bytes32 indexed pairKey, uint64 eta);
    event PoolListCommitted(bytes32 indexed pairKey);
    event PoolListCancelled(bytes32 indexed pairKey);
}
