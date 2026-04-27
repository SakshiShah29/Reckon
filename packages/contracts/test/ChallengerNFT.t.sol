// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, Vm} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ChallengerNFT} from "../src/inft/ChallengerNFT.sol";
import {MockVerifier} from "../src/inft/MockVerifier.sol";
import {IntelligentData} from "inft-ref/interfaces/IERC7857Metadata.sol";

contract ChallengerNFTTest is Test {
    ChallengerNFT internal nft;
    MockVerifier internal verifier;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        verifier = new MockVerifier();

        ChallengerNFT impl = new ChallengerNFT();
        bytes memory initData = abi.encodeCall(
            impl.initialize, ("Reckon Challenger", "RECK", "", address(verifier), admin)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        nft = ChallengerNFT(address(proxy));

        vm.prank(admin);
        nft.grantMinterRole(admin);
    }

    // ── helpers ──

    function _mintTo(address to) internal returns (uint256) {
        vm.prank(admin);
        return nft.mintWithRole(to, "ipfs://default-brain");
    }

    // ── Step 11.2: skeleton + mock oracle ──

    function test_initialize_name_symbol() public view {
        assertEq(nft.name(), "Reckon Challenger");
        assertEq(nft.symbol(), "RECK");
    }

    function test_initialize_verifier() public view {
        assertEq(address(nft.verifier()), address(verifier));
    }

    function test_mintAndOwnership() public {
        uint256 tokenId = _mintTo(alice);
        assertEq(nft.ownerOf(tokenId), alice);
    }

    function test_mintWithRole_setsTokenURI() public {
        uint256 tokenId = _mintTo(alice);
        assertEq(nft.tokenURI(tokenId), "ipfs://default-brain");
    }

    function test_transfer() public {
        uint256 tokenId = _mintTo(alice);

        vm.prank(alice);
        nft.transferFrom(alice, bob, tokenId);

        assertEq(nft.ownerOf(tokenId), bob);
    }

    // ── Step 11.3: updateBrain ──

    function test_updateBrain_onlyOwner() public {
        uint256 tokenId = _mintTo(alice);

        vm.prank(bob);
        vm.expectRevert("Not owner");
        nft.updateBrain(tokenId, "ipfs://new-brain");
    }

    function test_updateBrain_rejectsEmpty() public {
        uint256 tokenId = _mintTo(alice);

        vm.prank(alice);
        vm.expectRevert("Empty URI");
        nft.updateBrain(tokenId, "");
    }

    function test_updateBrain_updatesTokenURI() public {
        uint256 tokenId = _mintTo(alice);

        vm.prank(alice);
        nft.updateBrain(tokenId, "ipfs://new-brain");

        assertEq(nft.tokenURI(tokenId), "ipfs://new-brain");
    }

    function test_updateBrain_emits() public {
        uint256 tokenId = _mintTo(alice);

        vm.expectEmit(true, false, false, true, address(nft));
        emit ChallengerNFT.BrainUpdated(tokenId, "ipfs://default-brain", "ipfs://new-brain");

        vm.prank(alice);
        nft.updateBrain(tokenId, "ipfs://new-brain");
    }

    function test_updateBrain_brainTakesPriorityOverCustomURI() public {
        uint256 tokenId = _mintTo(alice);

        // Set custom URI via AgentNFT's setTokenURI
        vm.prank(alice);
        nft.setTokenURI(tokenId, "ipfs://custom");

        // Brain URI takes priority
        vm.prank(alice);
        nft.updateBrain(tokenId, "ipfs://brain-v2");

        assertEq(nft.tokenURI(tokenId), "ipfs://brain-v2");
    }

    // ── Step 11.4: Transfer event topic matches ERC-721 standard ──

    function test_transferEventTopic_isStandardERC721() public {
        uint256 tokenId = _mintTo(alice);

        vm.recordLogs();

        vm.prank(alice);
        nft.transferFrom(alice, bob, tokenId);

        Vm.Log[] memory entries = vm.getRecordedLogs();

        bytes32 expectedTopic = keccak256("Transfer(address,address,uint256)");
        bool found;
        for (uint256 i = 0; i < entries.length; i++) {
            if (entries[i].topics[0] == expectedTopic) {
                assertEq(address(uint160(uint256(entries[i].topics[1]))), alice);
                assertEq(address(uint160(uint256(entries[i].topics[2]))), bob);
                assertEq(uint256(entries[i].topics[3]), tokenId);
                found = true;
                break;
            }
        }
        assertTrue(found, "Standard ERC-721 Transfer event not found");
    }
}
