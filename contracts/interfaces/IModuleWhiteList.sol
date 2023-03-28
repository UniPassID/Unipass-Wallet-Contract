// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.15;

interface IModuleWhiteList {
    function isImplementationWhiteList(address _implementation) external view returns (bool isWhite);

    function isHookWhiteList(address _hook) external view returns (bool isWhite);
}
