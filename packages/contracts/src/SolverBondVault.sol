// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable} from "@openzeppelin/access/Ownable.sol";
import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/token/ERC20/utils/SafeERC20.sol";
import {IReckonRegistrar} from "./interfaces/IReckonRegistrar.sol";
import {IRoyaltyDistributor} from "./interfaces/IRoyaltyDistributor.sol";
import {ReckonErrors} from "./lib/ReckonErrors.sol";
import {ReckonEvents} from "./lib/ReckonEvents.sol";

/// @title SolverBondVault
/// @notice Holds USDC bonds for solvers, keyed by ENS namehash. Locks happen on
///         fill recording and unlock when challenge windows close. Slashing is
///         restricted to the Challenger contract.
contract SolverBondVault is Ownable {
    using SafeERC20 for IERC20;

    string internal constant REPUTATION_KEY = "reckon.reputation";
    uint256 internal constant REPUTATION_SCALE = 1e18;

    IERC20 public immutable usdc;
    IReckonRegistrar public immutable registrar;

    uint256 public baseBond = 1000e6;   // 1000 USDC
    uint256 public floorBond = 100e6;   // 100 USDC

    mapping(bytes32 node => uint256) public bondedAmount;
    mapping(bytes32 node => uint256) public lockedAmount;

    /// @notice The Challenger contract permitted to lock/unlock/slash bonds.
    ///         Set once via `setChallenger`.
    address public challenger;

    /// @notice Address of the FillRegistry (the only caller permitted to bump
    ///         `openFillCount`). Set once via `setFillRegistry`.
    address public fillRegistry;

    /// @notice RoyaltyDistributor that receives slashed funds for splitting.
    ///         Set once via `setRoyaltyDistributor`.
    IRoyaltyDistributor public royaltyDistributor;

    /// @notice Per-node count of fills currently inside their challenge window.
    ///         While > 0, the solver cannot withdraw any bond.
    mapping(bytes32 node => uint256) public openFillCount;

    constructor(address initialOwner, IERC20 _usdc, IReckonRegistrar _registrar) Ownable(initialOwner) {
        if (address(_usdc) == address(0) || address(_registrar) == address(0)) {
            revert ReckonErrors.ZeroAddress();
        }
        usdc = _usdc;
        registrar = _registrar;
    }

    /// @notice One-shot setter for the Challenger contract address. Owner only.
    function setChallenger(address _challenger) external onlyOwner {
        if (_challenger == address(0)) revert ReckonErrors.ZeroAddress();
        if (challenger != address(0)) revert ReckonErrors.AlreadyInitialized();
        challenger = _challenger;
    }

    /// @notice One-shot setter for the FillRegistry contract address. Owner only.
    function setFillRegistry(address _fillRegistry) external onlyOwner {
        if (_fillRegistry == address(0)) revert ReckonErrors.ZeroAddress();
        if (fillRegistry != address(0)) revert ReckonErrors.AlreadyInitialized();
        fillRegistry = _fillRegistry;
    }

    /// @notice One-shot setter for the RoyaltyDistributor address. Owner only.
    function setRoyaltyDistributor(address _royaltyDistributor) external onlyOwner {
        if (_royaltyDistributor == address(0)) revert ReckonErrors.ZeroAddress();
        if (address(royaltyDistributor) != address(0)) revert ReckonErrors.AlreadyInitialized();
        royaltyDistributor = IRoyaltyDistributor(_royaltyDistributor);
    }

    /// @notice Deposit USDC bond on behalf of the caller's registered subname.
    function deposit(uint256 amount) external {
        bytes32 node = registrar.namehashOf(msg.sender);
        bondedAmount[node] += amount;
        emit ReckonEvents.BondDeposited(node, amount);
        usdc.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Required bond for a node, decayed linearly by reputation.
    /// @dev Reputation is stored as a decimal-string text record at `reckon.reputation`,
    ///      scaled to 1e18 (0 = no reputation, 1e18 = max). Falls back to `baseBond`
    ///      on missing/malformed text record.
    function requiredBond(bytes32 node) external view returns (uint256) {
        (uint256 rep, bool ok) = _parseUint(registrar.getText(node, REPUTATION_KEY));
        if (!ok) return baseBond;
        if (rep >= REPUTATION_SCALE) return floorBond;
        // linear interpolation: bond = baseBond - rep/1e18 * (baseBond - floorBond)
        uint256 spread = baseBond - floorBond;
        return baseBond - (rep * spread) / REPUTATION_SCALE;
    }

    /// @notice Lock part of a node's bond. Challenger only.
    /// @dev Caller is expected to enforce semantics (e.g., per-fill counter); the
    ///      vault only ensures `bondedAmount[node] >= lockedAmount[node]`.
    function lock(bytes32 node, uint256 amount) external {
        if (msg.sender != challenger) revert ReckonErrors.NotChallenger();
        uint256 newLocked = lockedAmount[node] + amount;
        if (newLocked > bondedAmount[node]) revert ReckonErrors.InsufficientBond();
        lockedAmount[node] = newLocked;
        emit ReckonEvents.BondLocked(node, amount);
    }

    /// @notice Release a previously-locked portion. Challenger only.
    function unlock(bytes32 node, uint256 amount) external {
        if (msg.sender != challenger) revert ReckonErrors.NotChallenger();
        uint256 current = lockedAmount[node];
        if (amount > current) revert ReckonErrors.AmountLocked();
        unchecked {
            lockedAmount[node] = current - amount;
        }
        emit ReckonEvents.BondUnlocked(node, amount);
    }

    /// @notice Slash up to `amount` from the node's bond, transfer to
    ///         RoyaltyDistributor, and trigger distribution. Challenger only.
    /// @dev Caps at the available bonded amount. Decrements both bonded and locked
    ///      proportionally (locked is decremented up to `actual`). Returns the
    ///      actual amount slashed.
    function slash(bytes32 node, uint256 amount, bytes32 orderHash, uint256 tokenId) external returns (uint256) {
        if (msg.sender != challenger) revert ReckonErrors.NotChallenger();

        uint256 bonded = bondedAmount[node];
        uint256 actual = amount > bonded ? bonded : amount;
        if (actual == 0) return 0;

        uint256 locked = lockedAmount[node];
        uint256 lockedDelta = actual > locked ? locked : actual;

        bondedAmount[node] = bonded - actual;
        if (lockedDelta != 0) {
            unchecked {
                lockedAmount[node] = locked - lockedDelta;
            }
        }

        address distributor = address(royaltyDistributor);
        emit ReckonEvents.BondSlashed(node, actual, distributor);

        usdc.safeTransfer(distributor, actual);
        royaltyDistributor.distribute(actual, orderHash, tokenId);
        return actual;
    }

    /// @notice Amount currently withdrawable for `node` (bonded minus locked).
    function withdrawable(bytes32 node) public view returns (uint256) {
        return bondedAmount[node] - lockedAmount[node];
    }

    /// @notice Increment the per-node open-fill counter. Called by FillRegistry
    ///         when a fill is recorded; blocks the solver from withdrawing bond
    ///         while any of their fills is inside its challenge window.
    function lockOnFill(bytes32 node) external {
        if (msg.sender != fillRegistry) revert ReckonErrors.NotFillRegistry();
        uint256 next = openFillCount[node] + 1;
        openFillCount[node] = next;
        emit ReckonEvents.FillLocked(node, next);
    }

    /// @notice Decrement the per-node open-fill counter. Called by FillRegistry
    ///         once a fill ages past its challenge deadline (or is finalized via
    ///         a successful slash).
    function unlockOnFill(bytes32 node) external {
        if (msg.sender != fillRegistry) revert ReckonErrors.NotFillRegistry();
        uint256 current = openFillCount[node];
        if (current == 0) revert ReckonErrors.CounterUnderflow();
        unchecked {
            openFillCount[node] = current - 1;
        }
        emit ReckonEvents.FillUnlocked(node, current - 1);
    }

    /// @notice Withdraw unlocked bond back to the caller. Reverts if any portion
    ///         being withdrawn is currently amount-locked against a live challenge,
    ///         or if any of the solver's fills is still inside its challenge window.
    function withdraw(uint256 amount) external {
        bytes32 node = registrar.namehashOf(msg.sender);
        if (openFillCount[node] != 0) revert ReckonErrors.OpenFillsPending();
        uint256 free = withdrawable(node);
        if (amount > free) revert ReckonErrors.AmountLocked();

        bondedAmount[node] -= amount;
        emit ReckonEvents.BondWithdrawn(node, msg.sender, amount);

        usdc.safeTransfer(msg.sender, amount);
    }

    /// @dev Parse a decimal string into a uint256. Returns (0, false) on empty
    ///      input or any non-digit character. No leading-zero / overflow guard
    ///      beyond uint256 wrap (caller controls input via the registrar).
    function _parseUint(string memory s) internal pure returns (uint256, bool) {
        bytes memory b = bytes(s);
        if (b.length == 0) return (0, false);
        uint256 acc;
        for (uint256 i; i < b.length; ++i) {
            uint8 c = uint8(b[i]);
            if (c < 0x30 || c > 0x39) return (0, false);
            acc = acc * 10 + (c - 0x30);
        }
        return (acc, true);
    }
}
