// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "../modules/commons/ModuleCall.sol";
import "../modules/commons/ModuleAuthFixed.sol";
import "../modules/commons/ModuleHooks.sol";

contract ModuleMain is ModuleAuthFixed, ModuleHooks, ModuleCall {
    IModuleWhiteList private immutable WHITE_LIST;

    /**
     * @param _factory The Address Of ERC2470 Singleton Factory
     * @param _moduleMainUpgradable The Address Of ModuleMainUpgradable, which is used for first contract upgrade
     * @param _dkimKeys The Address Of DkimKeys, which is used for Dkim Verify
     */
    constructor(
        address _factory,
        address _moduleMainUpgradable,
        IDkimKeys _dkimKeys,
        IModuleWhiteList _whiteList
    ) ModuleAuthFixed(_factory, _moduleMainUpgradable, _dkimKeys) {
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
