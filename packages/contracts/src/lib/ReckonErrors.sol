// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title ReckonErrors
/// @notice Custom errors used across Reckon contracts. Centralizing keeps revert
///         signatures consistent and avoids string-revert gas overhead.
library ReckonErrors {
    // Registrar / identity
    error NotRegistered();
    error AlreadyRegistered();
    error EmptyLabel();
    error LabelTaken();
    error NotNodeOwner();
    error UnauthorizedTextWriter();
    error SelfChallengeForbidden();
    error NotRelayer();
    error ZeroNode();

    // Validator
    error InvalidValidationData();
    error ToleranceTooHigh();

    // FillRegistry
    error NotRecorder();
    error AlreadyRecorded();
    error MultiOutputUnsupported();
    error FillNotFound();
    error AlreadySlashed();

    // SolverBondVault / FillRegistry / shared
    error NotChallenger();
    error ChallengerAlreadyAdded();
    error ChallengerNotFound();
    error NotFillRegistry();
    error InsufficientBond();
    error AmountLocked();
    error OpenFillsPending();
    error CounterUnderflow();

    // EBBOOracle
    error InsufficientPools();
    error ZeroPrice();
    error TimelockNotElapsed();
    error NoPendingProposal();

    // Challenger
    error ChallengeWindowClosed();
    error ChallengerBondTooSmall();
    error NotAgentOwner();
    error PermitTransferMismatch();

    // OwnerRegistry
    error NotAttester();
    error NeverAttested();
    error AttestationStale();

    // RoyaltyDistributor
    error NotSolverBondVault();
    error InvalidSplit();
    error NothingQueued();

    // Roles / admin
    error NotOwner();
    error AlreadyInitialized();
    error ZeroAddress();
}
