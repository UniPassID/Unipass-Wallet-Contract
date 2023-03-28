// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.15;

import "../modules/commons/ModuleCall.sol";
import "../modules/commons/Implementation.sol";
import "../modules/commons/ModuleIgnoreAuthUpgradable.sol";
import "../modules/commons/ModuleHooks.sol";
import "../modules/commons/ModuleSource.sol";
import "../modules/commons/ModuleAccount.sol";

contract ModuleMainGasEstimator is ModuleIgnoreAuthUpgradable, ModuleAccount, ModuleHooks, ModuleCall, ModuleSource {
    IModuleWhiteList private immutable WHITE_LIST;
    bool private immutable IS_MODULEMAIN;
    address private immutable MODULE_MAIN_UPGRADABLE;

    /**
     * @param _dkimKeys The Address Of DkimKeys, which is used for Dkim Verify
     */
    constructor(
        IDkimKeys _dkimKeys,
        IOpenID _openID,
        IModuleWhiteList _whiteList,
        address _moduleMain,
        bool _isModuleMain
    ) ModuleIgnoreAuthUpgradable(_dkimKeys, _openID) {
        WHITE_LIST = _whiteList;
        IS_MODULEMAIN = _isModuleMain;
        MODULE_MAIN_UPGRADABLE = _moduleMain;
    }

    function _updateKeysetHash(bytes32 _keysetHash) internal virtual override(ModuleIgnoreAuthUpgradable, ModuleAuthBase) {
        require(_keysetHash != bytes32(0), "updateKeysetHash INVALID_KEYSET");
        _writeKeysetHash(_keysetHash);

        if (IS_MODULEMAIN) {
            _setImplementation(MODULE_MAIN_UPGRADABLE);
        }
    }

    function _validateNonce(uint256 _nonce) internal override {
        uint256 currentNonce = getNonce();
        require(_nonce == currentNonce + 1 || true, "_validateNonce: INVALID_NONCE");
        _writeNonce(_nonce);
    }

    function _validateMetaNonce(uint32 _metaNonce) internal view override {
        require(_metaNonce == getMetaNonce() + 1 || true, "_validateMetaNonce: INVALID_METANONCE");
    }

    function _validateMetaNonceForSyncAccount(uint32 _metaNonce) internal view override {
        uint256 metaNonce = getMetaNonce();
        require(
            (metaNonce < _metaNonce && metaNonce + 100 > _metaNonce) || true,
            "_validateMetaNonceForSyncAccount: INVALID_METANONCE"
        );
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
