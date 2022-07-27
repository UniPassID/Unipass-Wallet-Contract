// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "./ModuleAuthBase.sol";
import "../../Wallet.sol";

contract ModuleAuthFixed is ModuleAuthBase {
    bytes32 public immutable INIT_CODE_HASH;
    address public immutable FACTORY;
    address public immutable MODULE_MAIN_UPGRADABLE;

    constructor(
        address _factory,
        address _moduleMainUpgradable,
        IDkimKeys _dkimKeys
    ) ModuleAuthBase(_dkimKeys) {
        FACTORY = _factory;
        MODULE_MAIN_UPGRADABLE = _moduleMainUpgradable;
        INIT_CODE_HASH = keccak256(
            abi.encodePacked(
                Wallet.CREATION_CODE,
                uint256(uint160(address(this)))
            )
        );
    }

    /**
     * @notice Updates the signers configuration of the wallet
     * @param _keysetHash New required image hash of the signature
     * @dev It is recommended to not have more than 200 signers as opcode repricing
     *      could make transactions impossible to execute as all the signers must be
     *      passed for each transaction.
     */
    function _updateKeysetHash(bytes32 _keysetHash) internal override {
        require(
            _keysetHash != bytes32(0),
            "ModuleAuth#updateKeysetHash INVALID_KEYSET"
        );
        _writeKeysetHash(_keysetHash);
        emit KeysetHashUpdated(_keysetHash);

        _setImplementation(MODULE_MAIN_UPGRADABLE);
    }

    function _isValidKeysetHash(bytes32 _keysetHash)
        internal
        view
        override
        returns (bool)
    {
        return
            address(
                uint160(
                    uint256(
                        keccak256(
                            abi.encodePacked(
                                hex"ff",
                                FACTORY,
                                _keysetHash,
                                INIT_CODE_HASH
                            )
                        )
                    )
                )
            ) == address(this);
    }
}