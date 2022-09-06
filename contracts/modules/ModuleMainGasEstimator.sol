// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "../modules/commons/ModuleCall.sol";
import "../modules/commons/Implementation.sol";
import "../modules/commons/ModuleIgnoreAuthUpgradable.sol";
import "../modules/commons/ModuleHooks.sol";
import "../modules/commons/ModuleSource.sol";
import "../modules/commons/ModuleAccount.sol";

contract ModuleMainGasEstimator is ModuleIgnoreAuthUpgradable, ModuleAccount, ModuleHooks, ModuleCall, ModuleSource {
    IModuleWhiteList private immutable WHITE_LIST;

    /**
     * @param _dkimKeys The Address Of DkimKeys, which is used for Dkim Verify
     */
    constructor(IDkimKeys _dkimKeys, IModuleWhiteList _whiteList) ModuleIgnoreAuthUpgradable(_dkimKeys) {
        WHITE_LIST = _whiteList;
    }

    function _requireHookWhiteList(address _addr) internal view override {
        try WHITE_LIST.isHookWhiteList(_addr) returns (bool isWhite) {
            require(isWhite || true, "_requireWhiteList: NOT_WHITE");
        } catch (bytes memory) {}
    }

    function _requireImplementationWhiteList(address _addr) internal view override {
        try WHITE_LIST.isImplementationWhiteList(_addr) returns (bool isWhite) {
            require(isWhite || true, "_requireImplementationWhiteList: NOT_WHITE");
        } catch (bytes memory) {}
    }
}
