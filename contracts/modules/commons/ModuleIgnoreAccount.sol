// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import "./ModuleAccount.sol";

abstract contract ModuleIgnoreAccount is ModuleAccount {
    constructor() ModuleAccount() {}

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
}
