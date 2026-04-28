// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ISignatureTransfer} from "permit2/interfaces/ISignatureTransfer.sol";

import {OwnerRegistry} from "../src/OwnerRegistry.sol";
import {SolverRegistry} from "../src/SolverRegistry.sol";
import {ChallengerRegistry} from "../src/ChallengerRegistry.sol";
import {EBBOOracle} from "../src/EBBOOracle.sol";
import {SolverBondVault} from "../src/SolverBondVault.sol";
import {FillRegistry} from "../src/FillRegistry.sol";
import {RoyaltyDistributor} from "../src/RoyaltyDistributor.sol";
import {ReckonValidator} from "../src/ReckonValidator.sol";
import {Challenger} from "../src/Challenger.sol";
import {IReckonRegistrar} from "../src/interfaces/IReckonRegistrar.sol";
import {IReckonNamehashLookup} from "../src/interfaces/IReckonNamehashLookup.sol";
import {Addresses} from "../src/lib/Addresses.sol";

contract DeployBase is Script {
    // Canonical Base addresses
    address constant USDC = Addresses.USDC_BASE;
    address constant PERMIT2 = Addresses.PERMIT2;

    // Canonical USDC/WETH v3 pools on Base
    address constant POOL_A = 0x6c561B446416E1A00E8E93E221854d6eA4171372;
    address constant POOL_B = 0xd0b53D9277642d899DF5C87A3966A349A798F224;
    address constant POOL_C = 0x0b1C2DCbBfA744ebD3fC17fF1A96A1E1Eb4B2d69;

    // Deployed contracts
    OwnerRegistry public ownerRegistry;
    SolverRegistry public solverRegistry;
    ChallengerRegistry public challengerRegistry;
    EBBOOracle public ebboOracle;
    SolverBondVault public solverBondVault;
    FillRegistry public fillRegistry;
    RoyaltyDistributor public royaltyDistributor;
    ReckonValidator public reckonValidator;
    Challenger public challenger;

    function run() external {
        bool isAnvil = vm.envOr("ANVIL", false);

        address deployer = msg.sender;
        address owner = vm.envOr("OWNER", deployer);
        address relayer = vm.envOr("RELAYER", deployer);
        address attester = vm.envOr("ATTESTER", relayer);
        address recorder = vm.envOr("RECORDER", relayer);
        address treasury = vm.envOr("TREASURY", owner);

        if (isAnvil) {
            vm.createSelectFork(vm.rpcUrl("base"));
        }

        vm.startBroadcast();

        _deploy(owner, relayer, attester, recorder, treasury);
        _wire(owner);

        if (isAnvil) {
            _seed(owner, relayer, recorder, attester);
        }

        vm.stopBroadcast();

        _log();
    }

    function _deploy(
        address owner,
        address relayer,
        address attester,
        address recorder,
        address treasury
    ) internal {
        ownerRegistry = new OwnerRegistry(owner, attester);
        solverRegistry = new SolverRegistry(owner, relayer);
        challengerRegistry = new ChallengerRegistry(owner, relayer);
        ebboOracle = new EBBOOracle(owner);

        solverBondVault = new SolverBondVault(owner, IERC20(USDC), IReckonRegistrar(address(solverRegistry)));
        fillRegistry = new FillRegistry(owner, IReckonRegistrar(address(solverRegistry)), solverBondVault, recorder);

        royaltyDistributor = new RoyaltyDistributor(
            owner, IERC20(USDC), ownerRegistry, fillRegistry, treasury
        );

        reckonValidator = new ReckonValidator(IReckonRegistrar(address(solverRegistry)));

        challenger = new Challenger(
            owner,
            fillRegistry,
            ebboOracle,
            solverBondVault,
            ownerRegistry,
            IReckonRegistrar(address(solverRegistry)),
            IReckonNamehashLookup(address(challengerRegistry)),
            ISignatureTransfer(PERMIT2),
            IERC20(USDC),
            treasury
        );
    }

    function _wire(address owner) internal {
        solverBondVault.setFillRegistry(address(fillRegistry));
        solverBondVault.setRoyaltyDistributor(address(royaltyDistributor));
        solverBondVault.setChallenger(address(challenger));
        fillRegistry.setChallenger(address(challenger));
        royaltyDistributor.setSolverBondVault(address(solverBondVault));

        // Propose EBBO pool list (timelock applies on mainnet)
        EBBOOracle.PoolRef[] memory pools = new EBBOOracle.PoolRef[](3);
        pools[0] = EBBOOracle.PoolRef({pool: POOL_A});
        pools[1] = EBBOOracle.PoolRef({pool: POOL_B});
        pools[2] = EBBOOracle.PoolRef({pool: POOL_C});
        ebboOracle.proposePoolList(Addresses.USDC_BASE, Addresses.WETH_BASE, pools);
    }

    function _seed(address owner, address relayer, address recorder, address attester) internal {
        // Fast-forward past EBBO timelock and commit
        vm.warp(block.timestamp + 48 hours + 1);
        ebboOracle.commitPoolList(Addresses.USDC_BASE, Addresses.WETH_BASE);

        // Test EOAs
        address alice = address(0xA11CE);
        address bob = address(0xB0B);
        address eve = address(0xE4E);

        // Namehashes
        bytes32 aliceNode = keccak256("alice.solvers.reckon.eth");
        bytes32 bobNode = keccak256("bob.solvers.reckon.eth");
        bytes32 eveNode = keccak256("eve.challengers.reckon.eth");

        // Register solvers and challenger
        solverRegistry.register(aliceNode, alice);
        solverRegistry.register(bobNode, bob);
        challengerRegistry.register(eveNode, eve);

        // Seed reputation
        solverRegistry.setText(aliceNode, "reckon.reputation", "500000000000000000");
        solverRegistry.setText(bobNode, "reckon.reputation", "800000000000000000");

        // Fund test EOAs with USDC via storage slot manipulation
        _dealERC20(USDC, alice, 100_000e6);
        _dealERC20(USDC, bob, 100_000e6);
        _dealERC20(USDC, eve, 100_000e6);

        // Deposit bonds for solvers
        vm.stopBroadcast();

        vm.startPrank(alice);
        IERC20(USDC).approve(address(solverBondVault), 50_000e6);
        solverBondVault.deposit(50_000e6);
        vm.stopPrank();

        vm.startPrank(bob);
        IERC20(USDC).approve(address(solverBondVault), 50_000e6);
        solverBondVault.deposit(50_000e6);
        vm.stopPrank();

        // Attest NFT ownership for eve
        vm.prank(attester);
        ownerRegistry.attestOwner(1, eve);

        vm.startBroadcast();
    }

    function _dealERC20(address token, address to, uint256 amount) internal {
        // USDC on Base (FiatTokenV2) stores balances at slot 9
        bytes32 slot = keccak256(abi.encode(to, uint256(9)));
        vm.store(token, slot, bytes32(amount));
    }

    function _log() internal view {
        console.log("=== Deployed Addresses ===");
        console.log("OwnerRegistry:      ", address(ownerRegistry));
        console.log("SolverRegistry:     ", address(solverRegistry));
        console.log("ChallengerRegistry: ", address(challengerRegistry));
        console.log("EBBOOracle:         ", address(ebboOracle));
        console.log("SolverBondVault:    ", address(solverBondVault));
        console.log("FillRegistry:       ", address(fillRegistry));
        console.log("RoyaltyDistributor: ", address(royaltyDistributor));
        console.log("ReckonValidator:    ", address(reckonValidator));
        console.log("Challenger:         ", address(challenger));
    }
}
