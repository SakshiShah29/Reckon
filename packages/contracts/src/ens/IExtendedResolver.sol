// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice ENSIP-10 wildcard resolution interface.
interface IExtendedResolver {
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory);
}
