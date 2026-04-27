// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AgentNFT} from "inft-ref/AgentNFT.sol";

/// @notice ERC-7857 iNFT for Reckon challenger agents on 0G Galileo.
///         Extends AgentNFT with brain-blob URI rotation (updateBrain).
///         Uses MockVerifier for demo — never deploy with real bounty value.
contract ChallengerNFT is AgentNFT {
    event BrainUpdated(uint256 indexed tokenId, string oldURI, string newURI);

    bytes32 private constant _AGENT_STORAGE_SLOT =
        0x4aa80aaafbe0e5fe3fe1aa97f3c1f8c65d61f96ef1aab2b448154f4e07594600;

    function _agentStorage() private pure returns (AgentNFTStorage storage $) {
        assembly {
            $.slot := _AGENT_STORAGE_SLOT
        }
    }

    /// @notice Rotate the brain-blob URI for a challenger agent.
    ///         Only the current token owner may call.
    /// @param tokenId The token whose brain URI to update.
    /// @param newURI  Merkle root of the new brain blob on 0G Storage.
    function updateBrain(uint256 tokenId, string calldata newURI) external {
        require(_ownerOf(tokenId) == msg.sender, "Not owner");
        require(bytes(newURI).length > 0, "Empty URI");

        string memory oldURI = tokenURI(tokenId);
        _agentStorage().customURIs[tokenId] = newURI;

        emit BrainUpdated(tokenId, oldURI, newURI);
    }
}
