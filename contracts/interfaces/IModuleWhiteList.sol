// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

interface IModuleWhiteList {
    function isImplementationWhiteList(address _implementation) external view returns (bool isWhite);

    function isHookWhiteList(address _hook) external view returns (bool isWhite);
}
