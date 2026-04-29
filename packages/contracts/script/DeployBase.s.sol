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
        address treasury = vm.envOr("TREASURY", owner);

        vm.startBroadcast();

        _deploy(owner, relayer, treasury);
        _wire();

        if (isAnvil) {
            address solverEoa = vm.envAddress("SOLVER");
            address agentEoa = vm.envAddress("AGENT");
            uint256 relayerPk = vm.envUint("RELAYER_PK");
            uint256 solverPk = vm.envUint("SOLVER_PK");
            _seed(solverEoa, agentEoa, relayerPk, solverPk);
        }

        vm.stopBroadcast();

        _log();
    }

    function _deploy(
        address owner,
        address relayer,
        address treasury
    ) internal {
        ownerRegistry = new OwnerRegistry(owner, relayer);
        solverRegistry = new SolverRegistry(owner, relayer);
        challengerRegistry = new ChallengerRegistry(owner, relayer);
        EBBOOracle.PoolRef[] memory pools = new EBBOOracle.PoolRef[](3);
        pools[0] = EBBOOracle.PoolRef({pool: POOL_A});
        pools[1] = EBBOOracle.PoolRef({pool: POOL_B});
        pools[2] = EBBOOracle.PoolRef({pool: POOL_C});
        ebboOracle = new EBBOOracle(owner, USDC, Addresses.WETH_BASE, pools);

        solverBondVault = new SolverBondVault(owner, IERC20(USDC), IReckonRegistrar(address(solverRegistry)));
        fillRegistry = new FillRegistry(owner, IReckonRegistrar(address(solverRegistry)), solverBondVault, relayer);

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

    function _wire() internal {
        solverBondVault.setFillRegistry(address(fillRegistry));
        solverBondVault.setRoyaltyDistributor(address(royaltyDistributor));
        solverBondVault.setChallenger(address(challenger));
        fillRegistry.setChallenger(address(challenger));
        royaltyDistributor.setSolverBondVault(address(solverBondVault));
    }

    function _seed(address solverEoa, address agentEoa, uint256 relayerPk, uint256 solverPk) internal {
        bytes32 agentNode = keccak256("agent.challengers.reckon.eth");
        address relayerEoa = vm.addr(relayerPk);

        // Fund ETH via real transfers from deployer (cheatcodes don't persist to anvil)
        (bool s1,) = payable(solverEoa).call{value: 100 ether}("");
        (bool s2,) = payable(agentEoa).call{value: 100 ether}("");
        (bool s3,) = payable(relayerEoa).call{value: 100 ether}("");
        require(s1 && s2 && s3, "ETH transfer failed");

        vm.stopBroadcast();

        vm.startBroadcast(relayerPk);
        challengerRegistry.register(agentNode, agentEoa);
        ownerRegistry.attestOwner(1, agentEoa);
        vm.stopBroadcast();

        _logSeedCmds(solverEoa, agentEoa, relayerEoa);

        vm.startBroadcast();
    }

    function _logSeedCmds(address solverEoa, address agentEoa, address relayerEoa) internal view {
        console.log("");
        console.log("=== Post-Deploy: Run these to seed USDC + bond ===");
        string memory rpc = "cast rpc anvil_setStorageAt";
        string memory u = vm.toString(USDC);
        string memory amt = vm.toString(bytes32(uint256(100_000e6)));
        string memory rpcUrl = " --rpc-url $RPC_URL";
        console.log(string.concat(rpc, " ", u, " ", vm.toString(keccak256(abi.encode(solverEoa, uint256(9)))), " ", amt, rpcUrl));
        console.log(string.concat(rpc, " ", u, " ", vm.toString(keccak256(abi.encode(agentEoa, uint256(9)))), " ", amt, rpcUrl));
        console.log(string.concat(rpc, " ", u, " ", vm.toString(keccak256(abi.encode(relayerEoa, uint256(9)))), " ", amt, rpcUrl));
        string memory v = vm.toString(address(solverBondVault));
        console.log(string.concat("cast send ", u, " \"approve(address,uint256)\" ", v, " 50000000000 --private-key $SOLVER_PK", rpcUrl));
        console.log(string.concat("cast send ", v, " \"deposit(uint256)\" 50000000000 --private-key $SOLVER_PK", rpcUrl));
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
