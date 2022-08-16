// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "../modules/commons/ModuleCall.sol";
import "../modules/commons/ModuleAuthUpgradable.sol";
import "../modules/commons/ModuleHooks.sol";

contract ModuleMainUpgradable is ModuleCall, ModuleAuthUpgradable, ModuleHooks {
    IModuleWhiteList private immutable WHITE_LIST;

    /**
     * @param _dkimKeys The Address Of DkimKeys, which is used for Dkim Verify
     */
    constructor(IDkimKeys _dkimKeys, IModuleWhiteList _whiteList) ModuleAuthUpgradable(_dkimKeys) {
        WHITE_LIST = _whiteList;
    }

    function _requireHookWhiteList(address _addr) internal view override {
        try WHITE_LIST.isHookWhiteList(_addr) returns (bool isWhite) {
            require(isWhite, "_requireWhiteList: NOT_WHITE");
        } catch (bytes memory reason) {
            revert IsHooksWhiteListRevert(reason);
        }
    }

    function _requireImplementationWhiteList(address _addr) internal view override {
        try WHITE_LIST.isImplementationWhiteList(_addr) returns (bool isWhite) {
            require(isWhite, "_requireImplementationWhiteList: NOT_WHITE");
        } catch (bytes memory reason) {
            revert IsImplementationWhiteListRevert(reason);
        }
    }
}
