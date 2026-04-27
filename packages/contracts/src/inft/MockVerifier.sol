// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {
    IERC7857DataVerifier,
    TransferValidityProof,
    TransferValidityProofOutput
} from "inft-ref/interfaces/IERC7857DataVerifier.sol";

/// @notice Accepts all proofs without verification — demo only, never use with real value.
contract MockVerifier is IERC7857DataVerifier {
    function verifyTransferValidity(
        TransferValidityProof[] calldata proofs
    ) external pure override returns (TransferValidityProofOutput[] memory outputs) {
        outputs = new TransferValidityProofOutput[](proofs.length);
        for (uint256 i = 0; i < proofs.length; i++) {
            outputs[i] = TransferValidityProofOutput({
                dataHash: proofs[i].accessProof.dataHash,
                sealedKey: proofs[i].ownershipProof.sealedKey,
                targetPubkey: proofs[i].ownershipProof.targetPubkey,
                wantedKey: proofs[i].accessProof.targetPubkey,
                accessAssistant: address(0),
                accessProofNonce: proofs[i].accessProof.nonce,
                ownershipProofNonce: proofs[i].ownershipProof.nonce
            });
        }
    }
}
