// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, Vm} from "forge-std/Test.sol";
import {ReckonWildcardResolver} from "../src/ens/ReckonWildcardResolver.sol";
import {IExtendedResolver} from "../src/ens/IExtendedResolver.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract ReckonWildcardResolverTest is Test {
    ReckonWildcardResolver internal resolver;

    address internal owner;
    uint256 internal ownerKey;

    address internal signerAddr;
    uint256 internal signerKey;

    address internal stranger = makeAddr("stranger");

    string[] internal defaultUrls;

    function setUp() public {
        (owner, ownerKey) = makeAddrAndKey("owner");
        (signerAddr, signerKey) = makeAddrAndKey("signer");

        defaultUrls = new string[](1);
        defaultUrls[0] = "https://gateway.reckon.fi/{sender}/{data}.json";

        resolver = new ReckonWildcardResolver(owner, signerAddr, defaultUrls);
    }

    // ── helpers ──

    function _signResponse(
        bytes memory result,
        uint64 expires,
        bytes memory extraData
    ) internal view returns (bytes memory sig) {
        bytes32 structHash = keccak256(abi.encode(
            resolver.MESSAGE_TYPEHASH(),
            bytes32(uint256(uint160(address(resolver)))),
            expires,
            keccak256(extraData),
            keccak256(result)
        ));

        bytes32 domainSeparator = _domainSeparator();
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        sig = abi.encodePacked(r, s, v);
    }

    // ── Step 12.1: constructor + ERC-165 ──

    function test_constructor_sets_signer_and_urls() public view {
        assertEq(resolver.signer(), signerAddr);
        string[] memory urls = resolver.urls();
        assertEq(urls.length, 1);
        assertEq(urls[0], defaultUrls[0]);
    }

    function test_constructor_sets_owner() public view {
        assertEq(resolver.owner(), owner);
    }

    function test_constructor_reverts_zero_signer() public {
        vm.expectRevert("Zero signer");
        new ReckonWildcardResolver(owner, address(0), defaultUrls);
    }

    function test_constructor_reverts_empty_urls() public {
        string[] memory empty = new string[](0);
        vm.expectRevert("Empty URLs");
        new ReckonWildcardResolver(owner, signerAddr, empty);
    }

    function test_supportsInterface_extendedResolver() public view {
        assertTrue(resolver.supportsInterface(type(IExtendedResolver).interfaceId));
    }

    function test_supportsInterface_erc165() public view {
        assertTrue(resolver.supportsInterface(0x01ffc9a7));
    }

    // ── Step 12.2: OffchainLookup revert ──

    function test_resolve_reverts_with_offchainLookup_shape() public {
        bytes memory name = hex"0662756e6e6907736f6c76657273067265636b6f6e03657468";
        bytes memory data = abi.encodeWithSignature("text(bytes32,string)", bytes32(0), "reckon.reputation");

        vm.expectRevert();
        resolver.resolve(name, data);
    }

    function test_resolve_offchainLookup_fields() public {
        bytes memory name = hex"0662756e6e6907736f6c76657273067265636b6f6e03657468";
        bytes memory data = abi.encodeWithSignature("text(bytes32,string)", bytes32(0), "reckon.reputation");

        try resolver.resolve(name, data) returns (bytes memory) {
            revert("should have reverted");
        } catch (bytes memory reason) {
            // Decode OffchainLookup(address, string[], bytes, bytes4, bytes)
            // Skip first 4 bytes (selector)
            bytes4 selector = bytes4(reason);
            assertEq(selector, ReckonWildcardResolver.OffchainLookup.selector);

            (address sender, string[] memory urls, bytes memory callData, bytes4 callback, bytes memory extraData) =
                abi.decode(_sliceBytes(reason, 4), (address, string[], bytes, bytes4, bytes));

            assertEq(sender, address(resolver));
            assertEq(urls.length, 1);
            assertEq(urls[0], defaultUrls[0]);
            assertEq(callData, data);
            assertEq(callback, resolver.resolveWithProof.selector);
            assertEq(extraData, abi.encode(data));
        }
    }

    function test_resolve_passes_data_through_unchanged_to_extraData() public {
        bytes memory name = hex"00";
        bytes memory data = hex"deadbeef";

        try resolver.resolve(name, data) returns (bytes memory) {
            revert("should have reverted");
        } catch (bytes memory reason) {
            (, , , , bytes memory extraData) =
                abi.decode(_sliceBytes(reason, 4), (address, string[], bytes, bytes4, bytes));
            assertEq(abi.decode(extraData, (bytes)), data);
        }
    }

    // ── Step 12.3: resolveWithProof ──

    function test_resolveWithProof_returns_result_for_valid_signature() public view {
        bytes memory result = abi.encode("0.84");
        bytes memory data = abi.encodeWithSignature("text(bytes32,string)", bytes32(0), "reckon.reputation");
        bytes memory extraData = abi.encode(data);
        uint64 expires = uint64(block.timestamp + 60);

        bytes memory sig = _signResponse(result, expires, extraData);
        bytes memory response = abi.encode(result, expires, sig);

        bytes memory returned = resolver.resolveWithProof(response, extraData);
        assertEq(returned, result);
    }

    function test_resolveWithProof_reverts_on_expired_signature() public {
        bytes memory result = abi.encode("0.84");
        bytes memory extraData = abi.encode(hex"aa");
        uint64 expires = uint64(block.timestamp - 1);

        bytes memory sig = _signResponse(result, expires, extraData);
        bytes memory response = abi.encode(result, expires, sig);

        vm.expectRevert(ReckonWildcardResolver.SignatureExpired.selector);
        resolver.resolveWithProof(response, extraData);
    }

    function test_resolveWithProof_reverts_on_wrong_signer() public {
        bytes memory result = abi.encode("0.84");
        bytes memory extraData = abi.encode(hex"aa");
        uint64 expires = uint64(block.timestamp + 60);

        // Sign with a different key
        (, uint256 wrongKey) = makeAddrAndKey("wrong");
        bytes32 structHash = keccak256(abi.encode(
            resolver.MESSAGE_TYPEHASH(),
            bytes32(uint256(uint160(address(resolver)))),
            expires,
            keccak256(extraData),
            keccak256(result)
        ));
        bytes32 domainSeparator = _domainSeparator();
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongKey, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        bytes memory response = abi.encode(result, expires, sig);

        vm.expectRevert(ReckonWildcardResolver.UnauthorizedSigner.selector);
        resolver.resolveWithProof(response, extraData);
    }

    function test_resolveWithProof_reverts_on_tampered_result() public {
        bytes memory result = abi.encode("0.84");
        bytes memory extraData = abi.encode(hex"aa");
        uint64 expires = uint64(block.timestamp + 60);

        bytes memory sig = _signResponse(result, expires, extraData);

        // Tamper with result
        bytes memory tampered = abi.encode("0.99");
        bytes memory response = abi.encode(tampered, expires, sig);

        vm.expectRevert(ReckonWildcardResolver.UnauthorizedSigner.selector);
        resolver.resolveWithProof(response, extraData);
    }

    // ── Step 12.4: signer / URL rotation + Ownable2Step ──

    function test_setSigner_only_owner_emits() public {
        address newSigner = makeAddr("newSigner");

        vm.expectEmit(true, true, false, false, address(resolver));
        emit ReckonWildcardResolver.SignerRotated(signerAddr, newSigner);

        vm.prank(owner);
        resolver.setSigner(newSigner);

        assertEq(resolver.signer(), newSigner);
    }

    function test_setSigner_reverts_stranger() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        resolver.setSigner(makeAddr("x"));
    }

    function test_setSigner_reverts_zero() public {
        vm.prank(owner);
        vm.expectRevert("Zero signer");
        resolver.setSigner(address(0));
    }

    function test_setUrls_only_owner_emits() public {
        string[] memory newUrls = new string[](1);
        newUrls[0] = "https://new-gateway.reckon.fi/{sender}/{data}.json";

        vm.expectEmit(false, false, false, false, address(resolver));
        emit ReckonWildcardResolver.UrlsRotated();

        vm.prank(owner);
        resolver.setUrls(newUrls);

        string[] memory urls = resolver.urls();
        assertEq(urls[0], newUrls[0]);
    }

    function test_setUrls_reverts_stranger() public {
        string[] memory newUrls = new string[](1);
        newUrls[0] = "https://x.com";

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        resolver.setUrls(newUrls);
    }

    function test_ownership_transfer_two_step() public {
        address newOwner = makeAddr("newOwner");

        vm.prank(owner);
        resolver.transferOwnership(newOwner);

        // Not yet effective
        assertEq(resolver.owner(), owner);

        // Accept
        vm.prank(newOwner);
        resolver.acceptOwnership();

        assertEq(resolver.owner(), newOwner);
    }

    // ── util ──

    function _domainSeparator() internal view returns (bytes32) {
        (, string memory name, string memory version, uint256 chainId, address verifyingContract, , ) =
            resolver.eip712Domain();
        return keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes(name)),
            keccak256(bytes(version)),
            chainId,
            verifyingContract
        ));
    }

    function _sliceBytes(bytes memory b, uint256 start) internal pure returns (bytes memory) {
        require(start <= b.length, "slice out of bounds");
        bytes memory result = new bytes(b.length - start);
        for (uint256 i = 0; i < result.length; i++) {
            result[i] = b[start + i];
        }
        return result;
    }

    // ── resolve → callback round-trip ──

    function test_resolve_then_callback_roundtrip() public {
        bytes memory name = hex"0662756e6e6907736f6c76657273067265636b6f6e03657468";
        bytes memory data = abi.encodeWithSignature("text(bytes32,string)", bytes32(0), "reckon.reputation");

        // 1. Call resolve — expect OffchainLookup revert
        bytes memory extraData;
        try resolver.resolve(name, data) returns (bytes memory) {
            revert("should have reverted");
        } catch (bytes memory reason) {
            (, , , , extraData) =
                abi.decode(_sliceBytes(reason, 4), (address, string[], bytes, bytes4, bytes));
        }

        // 2. Simulate gateway: sign a response
        bytes memory result = abi.encode("0.84");
        uint64 expires = uint64(block.timestamp + 60);
        bytes memory sig = _signResponse(result, expires, extraData);
        bytes memory response = abi.encode(result, expires, sig);

        // 3. Call resolveWithProof — should return the result
        bytes memory returned = resolver.resolveWithProof(response, extraData);
        assertEq(abi.decode(returned, (string)), "0.84");
    }
}
