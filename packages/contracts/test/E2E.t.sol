// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ISignatureTransfer} from "permit2/interfaces/ISignatureTransfer.sol";
import {ERC20} from "solmate/src/tokens/ERC20.sol";

import {OwnerRegistry} from "../src/OwnerRegistry.sol";
import {SolverRegistry} from "../src/SolverRegistry.sol";
import {ChallengerRegistry} from "../src/ChallengerRegistry.sol";
import {EBBOOracle} from "../src/EBBOOracle.sol";
import {SolverBondVault} from "../src/SolverBondVault.sol";
import {FillRegistry} from "../src/FillRegistry.sol";
import {RoyaltyDistributor} from "../src/RoyaltyDistributor.sol";
import {Challenger} from "../src/Challenger.sol";
import {ReckonValidator} from "../src/ReckonValidator.sol";
import {IReckonRegistrar} from "../src/interfaces/IReckonRegistrar.sol";
import {IReckonNamehashLookup} from "../src/interfaces/IReckonNamehashLookup.sol";
import {Addresses} from "../src/lib/Addresses.sol";
import {ReckonEvents} from "../src/lib/ReckonEvents.sol";
import {ReckonErrors} from "../src/lib/ReckonErrors.sol";
import {MockPermit2} from "./mocks/MockPermit2.sol";

import {PriorityOrder, PriorityInput, PriorityOutput, PriorityCosignerData, PriorityOrderLib} from "uniswapx/lib/PriorityOrderLib.sol";
import {SignedOrder, ResolvedOrder, OrderInfo, OutputToken, InputToken} from "uniswapx/base/ReactorStructs.sol";
import {IReactor} from "uniswapx/interfaces/IReactor.sol";
import {IValidationCallback} from "uniswapx/interfaces/IValidationCallback.sol";

contract E2ETest is Test {
    using PriorityOrderLib for PriorityOrder;

    // Base mainnet canonical addresses
    address constant USDC = Addresses.USDC_BASE;
    address constant WETH = Addresses.WETH_BASE;
    address constant REAL_PERMIT2 = Addresses.PERMIT2;
    address constant REACTOR = Addresses.PRIORITY_ORDER_REACTOR;
    address constant POOL_A = 0x6c561B446416E1A00E8E93E221854d6eA4171372;
    address constant POOL_B = 0xd0b53D9277642d899DF5C87A3966A349A798F224;
    address constant POOL_C = 0x0b1C2DCbBfA744ebD3fC17fF1A96A1E1Eb4B2d69;

    // Permit2 EIP-712 constants
    bytes32 constant TOKEN_PERMISSIONS_TYPEHASH = keccak256("TokenPermissions(address token,uint256 amount)");
    bytes32 constant PERMIT_WITNESS_TRANSFER_TYPEHASH = keccak256(
        "PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline,"
        "PriorityOrder witness)"
        "OrderInfo(address reactor,address swapper,uint256 nonce,uint256 deadline,address additionalValidationContract,bytes additionalValidationData)"
        "PriorityInput(address token,uint256 amount,uint256 mpsPerPriorityFeeWei)"
        "PriorityOrder(OrderInfo info,address cosigner,uint256 auctionStartBlock,uint256 baselinePriorityFeeWei,PriorityInput input,PriorityOutput[] outputs)"
        "PriorityOutput(address token,uint256 amount,uint256 mpsPerPriorityFeeWei,address recipient)"
        "TokenPermissions(address token,uint256 amount)"
    );

    // Roles
    address admin = makeAddr("admin");
    address relayer = makeAddr("relayer");
    address recorder = makeAddr("recorder");
    address attester = makeAddr("attester");
    address treasury = makeAddr("treasury");

    // Actors
    address solver = makeAddr("solver");
    address swapper;
    uint256 swapperKey;
    address challEoa = makeAddr("challEoa");

    bytes32 solverNode = keccak256("solver.solvers.reckon.eth");
    bytes32 challNode = keccak256("chall.challengers.reckon.eth");

    uint256 agentTokenId = 1;

    // Contracts
    OwnerRegistry ownerRegistry;
    SolverRegistry solverRegistry;
    ChallengerRegistry challengerRegistry;
    EBBOOracle ebboOracle;
    SolverBondVault vault;
    FillRegistry fillRegistry;
    RoyaltyDistributor royalty;
    Challenger challenger;
    ReckonValidator reckonValidator;
    MockPermit2 permit2;

    function setUp() public {
        vm.createSelectFork(vm.rpcUrl("base"));

        (swapper, swapperKey) = makeAddrAndKey("swapper");

        permit2 = new MockPermit2();

        // Deploy
        ownerRegistry = new OwnerRegistry(admin, attester);
        solverRegistry = new SolverRegistry(admin, relayer);
        challengerRegistry = new ChallengerRegistry(admin, relayer);
        EBBOOracle.PoolRef[] memory pools = new EBBOOracle.PoolRef[](3);
        pools[0] = EBBOOracle.PoolRef({pool: POOL_A});
        pools[1] = EBBOOracle.PoolRef({pool: POOL_B});
        pools[2] = EBBOOracle.PoolRef({pool: POOL_C});
        ebboOracle = new EBBOOracle(admin, USDC, WETH, pools);

        vault = new SolverBondVault(admin, IERC20(USDC), IReckonRegistrar(address(solverRegistry)));
        fillRegistry = new FillRegistry(admin, IReckonRegistrar(address(solverRegistry)), vault, recorder);
        royalty = new RoyaltyDistributor(admin, IERC20(USDC), ownerRegistry, fillRegistry, treasury);

        reckonValidator = new ReckonValidator(IReckonRegistrar(address(solverRegistry)));

        challenger = new Challenger(
            admin,
            fillRegistry,
            ebboOracle,
            vault,
            ownerRegistry,
            IReckonRegistrar(address(solverRegistry)),
            IReckonNamehashLookup(address(challengerRegistry)),
            ISignatureTransfer(address(permit2)),
            IERC20(USDC),
            treasury
        );

        // Wire
        vm.startPrank(admin);
        vault.setFillRegistry(address(fillRegistry));
        vault.setRoyaltyDistributor(address(royalty));
        vault.setChallenger(address(challenger));
        fillRegistry.setChallenger(address(challenger));
        royalty.setSolverBondVault(address(vault));
        vm.stopPrank();

        // Register solver + challenger
        vm.startPrank(relayer);
        solverRegistry.register(solverNode, solver);
        challengerRegistry.register(challNode, challEoa);
        vm.stopPrank();

        // Attest NFT ownership
        vm.prank(attester);
        ownerRegistry.attestOwner(agentTokenId, challEoa);

        // Fund solver with USDC and deposit bond
        deal(USDC, solver, 100_000e6);
        vm.startPrank(solver);
        IERC20(USDC).approve(address(vault), 100_000e6);
        vault.deposit(100_000e6);
        vm.stopPrank();

        // Fund challenger with USDC
        deal(USDC, challEoa, 100_000e6);
        vm.prank(challEoa);
        IERC20(USDC).approve(address(permit2), type(uint256).max);
    }

    // ── helpers ──

    function _dummyPermit(uint256 amount) internal view returns (ISignatureTransfer.PermitTransferFrom memory) {
        return ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: USDC, amount: amount}),
            nonce: 0,
            deadline: block.timestamp + 1 hours
        });
    }

    function _minBond() internal view returns (uint256) {
        return vault.bondedAmount(solverNode) * challenger.minChallengerBondBps() / 10_000;
    }

    function _permit2DomainSeparator() internal view returns (bytes32) {
        return keccak256(abi.encode(
            keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)"),
            keccak256("Permit2"),
            block.chainid,
            REAL_PERMIT2
        ));
    }

    function _signPriorityOrder(
        uint256 signerKey,
        PriorityOrder memory order,
        bytes32 orderHash
    ) internal view returns (bytes memory) {
        bytes32 tokenPermHash = keccak256(abi.encode(
            TOKEN_PERMISSIONS_TYPEHASH,
            address(order.input.token),
            order.input.amount
        ));

        bytes32 structHash = keccak256(abi.encode(
            PERMIT_WITNESS_TRANSFER_TYPEHASH,
            tokenPermHash,
            REACTOR,
            order.info.nonce,
            order.info.deadline,
            orderHash
        ));

        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            _permit2DomainSeparator(),
            structHash
        ));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _buildSignedReactorOrder(
        address filler,
        uint256 usdcIn,
        uint256 wethOut,
        uint16 eboTolerance
    ) internal returns (SignedOrder memory) {
        deal(USDC, swapper, usdcIn);
        vm.prank(swapper);
        IERC20(USDC).approve(REAL_PERMIT2, type(uint256).max);

        deal(WETH, filler, wethOut);
        vm.prank(filler);
        IERC20(WETH).approve(REACTOR, type(uint256).max);

        PriorityOutput[] memory outputs = new PriorityOutput[](1);
        outputs[0] = PriorityOutput({
            token: WETH,
            amount: wethOut,
            mpsPerPriorityFeeWei: 0,
            recipient: swapper
        });

        PriorityOrder memory order = PriorityOrder({
            info: OrderInfo({
                reactor: IReactor(REACTOR),
                swapper: swapper,
                nonce: 0,
                deadline: block.timestamp + 1 hours,
                additionalValidationContract: IValidationCallback(address(reckonValidator)),
                additionalValidationData: abi.encode(uint16(eboTolerance))
            }),
            cosigner: address(0),
            auctionStartBlock: block.number,
            baselinePriorityFeeWei: 0,
            input: PriorityInput({
                token: ERC20(USDC),
                amount: usdcIn,
                mpsPerPriorityFeeWei: 0
            }),
            outputs: outputs,
            cosignerData: PriorityCosignerData({auctionTargetBlock: 0}),
            cosignature: ""
        });

        bytes32 orderHash = order.hash();
        bytes memory sig = _signPriorityOrder(swapperKey, order, orderHash);

        return SignedOrder({order: abi.encode(order), sig: sig});
    }

    // ── Step 14.1: bad fill gets slashed ──

    function test_HappyPath_BadFill_GetsSlashed() public {
        vm.txGasPrice(block.basefee);

        uint256 benchmark = ebboOracle.computeBenchmark(USDC, WETH);
        assertGt(benchmark, 0, "benchmark should be non-zero on fork");

        uint128 inputAmount = 1e18;
        uint16 eboTolerance = 100;
        uint128 outputAmount = uint128(benchmark / 2);

        // ── 1. Validate: solver fills through PriorityOrderReactor ──
        // ReckonValidator.validate() checks solver registration + eboTolerance
        SignedOrder memory signedOrder = _buildSignedReactorOrder(solver, inputAmount, outputAmount, eboTolerance);
        vm.prank(solver);
        IReactor(REACTOR).execute(signedOrder);

        assertEq(IERC20(WETH).balanceOf(swapper), outputAmount, "swapper should receive WETH from fill");
        assertEq(IERC20(USDC).balanceOf(solver), inputAmount, "solver should receive USDC from fill");

        // ── 2. Record: relayer observes Fill event and records on-chain ──
        bytes32 orderHash = keccak256("e2e.order.1");

        vm.prank(recorder);
        fillRegistry.recordFill({
            orderHash: orderHash,
            filler: solver,
            swapper: swapper,
            tokenIn: USDC,
            tokenOut: WETH,
            inputAmount: inputAmount,
            outputAmount: outputAmount,
            eboTolerance: eboTolerance,
            outputsLength: 1,
            fillBlock: uint64(block.number)
        });

        // ── 3. Challenge: challenger spots bad fill and submits ──
        uint256 solverBondBefore = vault.bondedAmount(solverNode);
        uint256 challBalanceBefore = IERC20(USDC).balanceOf(challEoa);
        uint256 swapperBalanceBefore = IERC20(USDC).balanceOf(swapper);
        uint256 treasuryBalanceBefore = IERC20(USDC).balanceOf(treasury);

        uint256 bond = _minBond();
        vm.prank(challEoa);
        challenger.submit(orderHash, bond, agentTokenId, _dummyPermit(bond), "");

        // ── 4. Slash: solver bond decremented, royalties distributed ──
        uint256 solverBondAfter = vault.bondedAmount(solverNode);
        assertLt(solverBondAfter, solverBondBefore, "solver bond should decrease");
        uint256 slashAmount = solverBondBefore - solverBondAfter;
        assertGt(slashAmount, 0, "slash amount should be positive");

        FillRegistry.FillRecord memory r = fillRegistry.getFill(orderHash);
        assertTrue(r.slashed, "fill should be marked slashed");

        uint256 swapperAmt = slashAmount * 6000 / 10_000;
        uint256 ownerAmt = slashAmount * 3000 / 10_000;
        uint256 protocolAmt = slashAmount - swapperAmt - ownerAmt;

        assertEq(
            IERC20(USDC).balanceOf(swapper),
            swapperBalanceBefore + swapperAmt,
            "swapper should receive 60%"
        );
        assertEq(
            IERC20(USDC).balanceOf(challEoa),
            challBalanceBefore + ownerAmt,
            "owner (challEoa) should receive 30%"
        );
        assertEq(
            IERC20(USDC).balanceOf(treasury),
            treasuryBalanceBefore + protocolAmt,
            "treasury should receive 10%"
        );

        // ── 5. Replay protection: second challenge reverts ──
        vm.prank(challEoa);
        vm.expectRevert(ReckonErrors.AlreadySlashed.selector);
        challenger.submit(orderHash, bond, agentTokenId, _dummyPermit(bond), "");
    }

    // ── Step 14.1: PriorityOrderReactor + ReckonValidator ──

    function test_Reactor_RegisteredSolverFills() public {
        vm.txGasPrice(block.basefee);

        uint256 usdcAmount = 1000e6;
        uint256 wethAmount = 0.3 ether;

        SignedOrder memory signedOrder = _buildSignedReactorOrder(solver, usdcAmount, wethAmount, 100);
        vm.prank(solver);
        IReactor(REACTOR).execute(signedOrder);

        assertEq(IERC20(WETH).balanceOf(swapper), wethAmount, "swapper should receive WETH");
        assertEq(IERC20(USDC).balanceOf(solver), usdcAmount, "solver should receive USDC");
    }

    function test_Reactor_UnregisteredFillerReverts() public {
        vm.txGasPrice(block.basefee);

        address unregistered = makeAddr("unregistered");
        SignedOrder memory signedOrder = _buildSignedReactorOrder(unregistered, 1000e6, 0.3 ether, 100);

        vm.prank(unregistered);
        vm.expectRevert(ReckonErrors.NotRegistered.selector);
        IReactor(REACTOR).execute(signedOrder);
    }
}
