// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

abstract contract ModuleNonceBase {
    function getNonce() public view virtual returns (uint256);
}
