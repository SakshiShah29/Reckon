// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";
import {ISignatureTransfer} from "permit2/interfaces/ISignatureTransfer.sol";
import {Challenger} from "../src/Challenger.sol";
import {FillRegistry} from "../src/FillRegistry.sol";
import {EBBOOracle} from "../src/EBBOOracle.sol";
import {SolverBondVault} from "../src/SolverBondVault.sol";
import {RoyaltyDistributor} from "../src/RoyaltyDistributor.sol";
import {OwnerRegistry} from "../src/OwnerRegistry.sol";
import {IReckonRegistrar} from "../src/interfaces/IReckonRegistrar.sol";
import {IReckonNamehashLookup} from "../src/interfaces/IReckonNamehashLookup.sol";
import {MockReckonRegistrar} from "./mocks/MockReckonRegistrar.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {MockEBBOOracle} from "./mocks/MockEBBOOracle.sol";
import {MockPermit2} from "./mocks/MockPermit2.sol";
import {ReckonErrors} from "../src/lib/ReckonErrors.sol";
import {ReckonEvents} from "../src/lib/ReckonEvents.sol";

contract ChallengerTest is Test {
    Challenger internal challenger;
    FillRegistry internal fillReg;
    SolverBondVault internal vault;
    RoyaltyDistributor internal royalty;
    OwnerRegistry internal ownerReg;
    MockReckonRegistrar internal solverReg;
    MockReckonRegistrar internal challReg;
    MockEBBOOracle internal ebbo;
    MockPermit2 internal permit2;
    MockUSDC internal usdc;

    address internal admin = makeAddr("admin");
    address internal attester = makeAddr("attester");
    address internal recorder = makeAddr("recorder");
    address internal treasury = makeAddr("treasury");

    address internal solver = makeAddr("solver");
    bytes32 internal solverNode = keccak256("solver.solvers.reckon.eth");

    address internal challEoa = makeAddr("challEoa");
    bytes32 internal challNode = keccak256("chall.challengers.reckon.eth");

    address internal stranger = makeAddr("stranger");

    bytes32 internal orderHash = keccak256("order.1");
    address internal swapper = makeAddr("swapper");
    address internal tokenIn = makeAddr("tokenIn");
    address internal tokenOut = makeAddr("tokenOut");

    uint256 internal agentTokenId = 7;

    // Fill: 1e18 input, 990 output, 1% tolerance
    // expectedOutput = benchmark * 1e18 / 1e18 * 9900 / 10_000 = benchmark * 0.99
    // Success: benchmark=1100 → expected=1089 > 990
    // Failure: benchmark=900  → expected=891  < 990
    uint128 internal inputAmount = 1e18;
    uint128 internal outputAmount = 990;
    uint16 internal eboTolerance = 100;

    function setUp() public {
        usdc = new MockUSDC();
        solverReg = new MockReckonRegistrar();
        challReg = new MockReckonRegistrar();
        ownerReg = new OwnerRegistry(admin, attester);
        ebbo = new MockEBBOOracle();
        permit2 = new MockPermit2();

        vault = new SolverBondVault(admin, IERC20(address(usdc)), solverReg);
        fillReg = new FillRegistry(admin, solverReg, vault, recorder);
        royalty = new RoyaltyDistributor(
            admin, IERC20(address(usdc)), ownerReg, fillReg, treasury
        );

        challenger = new Challenger(
            admin,
            fillReg,
            EBBOOracle(address(ebbo)),
            vault,
            ownerReg,
            IReckonRegistrar(address(solverReg)),
            IReckonNamehashLookup(address(challReg)),
            ISignatureTransfer(address(permit2)),
            IERC20(address(usdc)),
            treasury
        );

        // Wire contracts
        vm.startPrank(admin);
        vault.setFillRegistry(address(fillReg));
        vault.setRoyaltyDistributor(address(royalty));
        vault.setChallenger(address(challenger));
        fillReg.setChallenger(address(challenger));
        royalty.setSolverBondVault(address(vault));
        vm.stopPrank();

        // Register solver, deposit bond
        solverReg.mint(solver, solverNode, MockReckonRegistrar.Role.Solver);
        usdc.mint(solver, 10_000e6);
        vm.startPrank(solver);
        usdc.approve(address(vault), 10_000e6);
        vault.deposit(10_000e6);
        vm.stopPrank();

        // Register challenger, attest NFT ownership
        challReg.mint(challEoa, challNode, MockReckonRegistrar.Role.Challenger);
        vm.prank(attester);
        ownerReg.attestOwner(agentTokenId, challEoa);

        // Record a fill
        vm.prank(recorder);
        fillReg.recordFill({
            orderHash: orderHash,
            filler: solver,
            swapper: swapper,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            inputAmount: inputAmount,
            outputAmount: outputAmount,
            eboTolerance: eboTolerance,
            outputsLength: 1,
            fillBlock: uint64(block.number)
        });

        // Default benchmark makes challenge succeed
        ebbo.setBenchmarkPrice(1100);
    }

    // ── helpers ──

    function _fundChallenger(uint256 amount) internal {
        usdc.mint(challEoa, amount);
        vm.prank(challEoa);
        usdc.approve(address(permit2), amount);
    }

    function _dummyPermit(uint256 amount) internal view returns (ISignatureTransfer.PermitTransferFrom memory) {
        return ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(usdc), amount: amount}),
            nonce: 0,
            deadline: block.timestamp + 1 hours
        });
    }

    function _defaultBond() internal view returns (uint256) {
        // 10% of solver bond (10_000e6) = 1000e6
        return vault.bondedAmount(solverNode) * challenger.minChallengerBondBps() / 10_000;
    }

    function _submitSuccess() internal {
        uint256 bond = _defaultBond();
        _fundChallenger(bond);
        vm.prank(challEoa);
        challenger.submit(orderHash, bond, agentTokenId, _dummyPermit(bond), "");
    }

    // ── constructor ──

    function test_constructor_wires_all_deps() public view {
        assertEq(address(challenger.fillRegistry()), address(fillReg));
        assertEq(address(challenger.ebbo()), address(ebbo));
        assertEq(address(challenger.solverBondVault()), address(vault));
        assertEq(address(challenger.ownerRegistry()), address(ownerReg));
        assertEq(address(challenger.solverRegistry()), address(solverReg));
        assertEq(address(challenger.challengerRegistry()), address(challReg));
        assertEq(address(challenger.permit2()), address(permit2));
        assertEq(address(challenger.usdc()), address(usdc));
        assertEq(challenger.protocolTreasury(), treasury);
        assertEq(challenger.minChallengerBondBps(), 1000);
    }

    function test_constructor_reverts_on_zero_fillReg() public {
        vm.expectRevert(ReckonErrors.ZeroAddress.selector);
        new Challenger(
            admin, FillRegistry(address(0)), EBBOOracle(address(ebbo)), vault,
            ownerReg, IReckonRegistrar(address(solverReg)),
            IReckonNamehashLookup(address(challReg)),
            ISignatureTransfer(address(permit2)), IERC20(address(usdc)), treasury
        );
    }

    // ── preflight reverts ──

    function test_submit_reverts_fill_not_found() public {
        uint256 bond = _defaultBond();
        _fundChallenger(bond);
        vm.prank(challEoa);
        vm.expectRevert(ReckonErrors.FillNotFound.selector);
        challenger.submit(keccak256("ghost"), bond, agentTokenId, _dummyPermit(bond), "");
    }

    function test_submit_reverts_already_slashed() public {
        _submitSuccess();

        // Try again on the same (now slashed) order
        uint256 bond = _defaultBond();
        _fundChallenger(bond);
        vm.prank(challEoa);
        vm.expectRevert(ReckonErrors.AlreadySlashed.selector);
        challenger.submit(orderHash, bond, agentTokenId, _dummyPermit(bond), "");
    }

    function test_submit_reverts_challenge_window_closed() public {
        // Roll past the challenge deadline
        vm.roll(block.number + 1801);

        uint256 bond = _defaultBond();
        _fundChallenger(bond);
        vm.prank(challEoa);
        vm.expectRevert(ReckonErrors.ChallengeWindowClosed.selector);
        challenger.submit(orderHash, bond, agentTokenId, _dummyPermit(bond), "");
    }

    function test_submit_reverts_challenger_not_registered() public {
        uint256 bond = _defaultBond();
        _fundChallenger(bond);
        vm.prank(stranger);
        vm.expectRevert(ReckonErrors.NotRegistered.selector);
        challenger.submit(orderHash, bond, agentTokenId, _dummyPermit(bond), "");
    }

    function test_submit_reverts_self_challenge() public {
        // Register solver in the challenger registry with the SAME node
        challReg.mint(solver, solverNode, MockReckonRegistrar.Role.Challenger);

        uint256 bond = _defaultBond();
        usdc.mint(solver, bond);
        vm.prank(solver);
        usdc.approve(address(permit2), bond);

        vm.prank(solver);
        vm.expectRevert(ReckonErrors.SelfChallengeForbidden.selector);
        challenger.submit(orderHash, bond, agentTokenId, _dummyPermit(bond), "");
    }

    function test_submit_reverts_not_agent_owner() public {
        // Attest a different owner for the agent token
        vm.prank(attester);
        ownerReg.attestOwner(agentTokenId, makeAddr("someoneElse"));

        uint256 bond = _defaultBond();
        _fundChallenger(bond);
        vm.prank(challEoa);
        vm.expectRevert(ReckonErrors.NotAgentOwner.selector);
        challenger.submit(orderHash, bond, agentTokenId, _dummyPermit(bond), "");
    }

    // ── bond validation ──

    function test_submit_reverts_bond_too_small() public {
        uint256 tooSmall = _defaultBond() - 1;
        _fundChallenger(tooSmall);
        vm.prank(challEoa);
        vm.expectRevert(ReckonErrors.ChallengerBondTooSmall.selector);
        challenger.submit(orderHash, tooSmall, agentTokenId, _dummyPermit(tooSmall), "");
    }

    // ── success branch ──

    function test_submit_success_slashes_solver_bond() public {
        uint256 bondBefore = vault.bondedAmount(solverNode);
        _submitSuccess();

        // shortfall = 1089 - 990 = 99, capped at solver bond (10_000e6)
        // slashAmount = 99
        assertEq(vault.bondedAmount(solverNode), bondBefore - 99);
    }

    function test_submit_success_marks_fill_slashed() public {
        _submitSuccess();
        FillRegistry.FillRecord memory r = fillReg.getFill(orderHash);
        assertTrue(r.slashed);
    }

    function test_submit_success_returns_challenger_bond() public {
        uint256 bond = _defaultBond();
        _fundChallenger(bond);

        vm.prank(challEoa);
        challenger.submit(orderHash, bond, agentTokenId, _dummyPermit(bond), "");

        // challEoa receives bond return + NFT owner royalty share (29)
        // since challEoa is attested owner of agentTokenId
        uint256 ownerRoyalty = uint256(99) * 3000 / 10_000; // 29
        assertEq(usdc.balanceOf(challEoa), bond + ownerRoyalty);
    }

    function test_submit_success_distributes_royalties() public {
        _submitSuccess();

        // slashAmount = 99, distributed via RoyaltyDistributor (60/30/10)
        // swapper gets 99 * 6000 / 10_000 = 59
        // treasury gets remainder after owner share
        assertGt(usdc.balanceOf(swapper), 0);
    }

    function test_submit_success_emits_challenge_submitted() public {
        uint256 bond = _defaultBond();
        _fundChallenger(bond);

        vm.expectEmit(true, true, false, true, address(challenger));
        emit ReckonEvents.ChallengeSubmitted(orderHash, challNode, agentTokenId, bond);

        vm.prank(challEoa);
        challenger.submit(orderHash, bond, agentTokenId, _dummyPermit(bond), "");
    }

    function test_submit_success_emits_challenge_succeeded() public {
        uint256 bond = _defaultBond();
        _fundChallenger(bond);

        vm.expectEmit(true, true, true, true, address(challenger));
        emit ReckonEvents.ChallengeSucceeded(orderHash, solverNode, challNode, 99);

        vm.prank(challEoa);
        challenger.submit(orderHash, bond, agentTokenId, _dummyPermit(bond), "");
    }

    function test_submit_success_slash_capped_at_solver_bond() public {
        // Drain most of the solver bond first via a direct slash from the challenger contract
        // We'll just set a very high benchmark instead so shortfall >> bond
        ebbo.setBenchmarkPrice(1e30);

        uint256 bondBefore = vault.bondedAmount(solverNode);
        uint256 bond = _defaultBond();
        _fundChallenger(bond);

        vm.prank(challEoa);
        challenger.submit(orderHash, bond, agentTokenId, _dummyPermit(bond), "");

        assertEq(vault.bondedAmount(solverNode), 0);
        // Full solver bond was slashed
        FillRegistry.FillRecord memory r = fillReg.getFill(orderHash);
        assertTrue(r.slashed);
    }

    // ── failure branch ──

    function test_submit_failure_forfeits_bond_to_treasury() public {
        ebbo.setBenchmarkPrice(900);

        uint256 bond = _defaultBond();
        _fundChallenger(bond);
        uint256 treasuryBefore = usdc.balanceOf(treasury);

        vm.prank(challEoa);
        challenger.submit(orderHash, bond, agentTokenId, _dummyPermit(bond), "");

        assertEq(usdc.balanceOf(treasury), treasuryBefore + bond);
    }

    function test_submit_failure_does_not_slash_solver() public {
        ebbo.setBenchmarkPrice(900);

        uint256 bondBefore = vault.bondedAmount(solverNode);
        uint256 bond = _defaultBond();
        _fundChallenger(bond);

        vm.prank(challEoa);
        challenger.submit(orderHash, bond, agentTokenId, _dummyPermit(bond), "");

        assertEq(vault.bondedAmount(solverNode), bondBefore);
    }

    function test_submit_failure_does_not_mark_slashed() public {
        ebbo.setBenchmarkPrice(900);

        uint256 bond = _defaultBond();
        _fundChallenger(bond);

        vm.prank(challEoa);
        challenger.submit(orderHash, bond, agentTokenId, _dummyPermit(bond), "");

        FillRegistry.FillRecord memory r = fillReg.getFill(orderHash);
        assertFalse(r.slashed);
    }

    function test_submit_failure_emits_challenge_failed() public {
        ebbo.setBenchmarkPrice(900);

        uint256 bond = _defaultBond();
        _fundChallenger(bond);

        vm.expectEmit(true, true, false, true, address(challenger));
        emit ReckonEvents.ChallengeFailed(orderHash, solverNode, challEoa);

        vm.prank(challEoa);
        challenger.submit(orderHash, bond, agentTokenId, _dummyPermit(bond), "");
    }

    // ── edge: exact boundary ──

    function test_submit_failure_when_output_equals_expected() public {
        // benchmark * 0.99 = 990 exactly → outputAmount == expectedOutput → failure branch
        ebbo.setBenchmarkPrice(1000);

        uint256 bond = _defaultBond();
        _fundChallenger(bond);

        vm.prank(challEoa);
        challenger.submit(orderHash, bond, agentTokenId, _dummyPermit(bond), "");

        // Should NOT slash
        FillRegistry.FillRecord memory r = fillReg.getFill(orderHash);
        assertFalse(r.slashed);
        // Bond forfeited
        assertGt(usdc.balanceOf(treasury), 0);
    }
}
