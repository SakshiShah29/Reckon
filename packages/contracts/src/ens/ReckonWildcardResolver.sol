// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IExtendedResolver} from "./IExtendedResolver.sol";

/// @notice ENSIP-10 + EIP-3668 wildcard resolver for *.reckon.eth.
///         All lookups revert with OffchainLookup; the client follows the URL
///         to the gateway, which signs a response verified in resolveWithProof.
contract ReckonWildcardResolver is IExtendedResolver, ERC165, EIP712, Ownable2Step {
    // ── errors ──
    error SignatureExpired();
    error UnauthorizedSigner();

    // ── events ──
    event SignerRotated(address indexed prev, address indexed next);
    event UrlsRotated();

    // ── EIP-3668 ──
    error OffchainLookup(
        address sender,
        string[] urls,
        bytes callData,
        bytes4 callbackFunction,
        bytes extraData
    );

    // ── EIP-712 typehash ──
    bytes32 public constant MESSAGE_TYPEHASH =
        keccak256("Message(bytes32 sender,uint64 expires,bytes32 requestHash,bytes32 resultHash)");

    // ── state ──
    address public signer;
    string[] internal _urls;

    constructor(
        address owner_,
        address signer_,
        string[] memory urls_
    ) EIP712("ReckonWildcardResolver", "1") Ownable(owner_) {
        require(signer_ != address(0), "Zero signer");
        require(urls_.length > 0, "Empty URLs");
        signer = signer_;
        _urls = urls_;
    }

    // ── ENSIP-10: resolve ──

    function resolve(bytes calldata, bytes calldata data) external view override returns (bytes memory) {
        revert OffchainLookup(
            address(this),
            _urls,
            data,
            this.resolveWithProof.selector,
            abi.encode(data)
        );
    }

    // ── EIP-3668 callback ──

    function resolveWithProof(
        bytes calldata response,
        bytes calldata extraData
    ) external view returns (bytes memory) {
        (bytes memory result, uint64 expires, bytes memory sig) =
            abi.decode(response, (bytes, uint64, bytes));

        if (expires < block.timestamp) revert SignatureExpired();

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            MESSAGE_TYPEHASH,
            bytes32(uint256(uint160(address(this)))),
            expires,
            keccak256(extraData),
            keccak256(result)
        )));

        address recovered = ECDSA.recover(digest, sig);
        if (recovered != signer) revert UnauthorizedSigner();

        return result;
    }

    // ── admin ──

    function setSigner(address newSigner) external onlyOwner {
        require(newSigner != address(0), "Zero signer");
        address prev = signer;
        signer = newSigner;
        emit SignerRotated(prev, newSigner);
    }

    function setUrls(string[] calldata newUrls) external onlyOwner {
        require(newUrls.length > 0, "Empty URLs");
        delete _urls;
        for (uint256 i = 0; i < newUrls.length; i++) {
            _urls.push(newUrls[i]);
        }
        emit UrlsRotated();
    }

    function urls() external view returns (string[] memory) {
        return _urls;
    }

    // ── ERC-165 ──

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == type(IExtendedResolver).interfaceId || super.supportsInterface(interfaceId);
    }
}
