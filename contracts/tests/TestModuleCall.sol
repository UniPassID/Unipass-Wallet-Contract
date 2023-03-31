//SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import "../modules/commons/ModuleCall.sol";
import "../modules/commons/ModuleAuthFixed.sol";
import "../modules/commons/ModuleHooks.sol";
import "../modules/commons/ModuleAccount.sol";

contract TestModuleCall is ModuleCall, ModuleAuthFixed, ModuleHooks, ModuleAccount {
    IModuleWhiteList private immutable WHITE_LIST;

    constructor(
        address _factory,
        address _moduleMainUpgradable,
        IDkimKeys _dkimKeys,
        IOpenID _openID,
        IModuleWhiteList _whiteList
    ) ModuleAuthFixed(_factory, _moduleMainUpgradable, _dkimKeys, _openID) {
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
