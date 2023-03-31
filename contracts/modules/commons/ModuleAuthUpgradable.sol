// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import "./ModuleAuth.sol";
import "../../Wallet.sol";

abstract contract ModuleAuthUpgradable is ModuleAuth {
    constructor(IDkimKeys _dkimKeys, IOpenID _openID) ModuleAuth(_dkimKeys, _openID) {}

    /**
     * @notice Updates the signers configuration of the wallet
     * @param _keysetHash New required keysetHash of the signature
     * @dev It is recommended to not have more than 200 signers as opcode repricing
     *      could make transactions impossible to execute as all the signers must be
     *      passed for each transaction.
     */
    function _updateKeysetHash(bytes32 _keysetHash) internal virtual override {
        require(_keysetHash != bytes32(0), "updateKeysetHash INVALID_KEYSET");
        _writeKeysetHash(_keysetHash);
    }

    function isValidKeysetHash(bytes32 _keysetHash) public view virtual override returns (bool) {
        return _keysetHash != bytes32(0) && getKeysetHash() == _keysetHash;
    }
}
