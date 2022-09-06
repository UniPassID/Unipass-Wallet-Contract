// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "hardhat/console.sol";

/**
 * @dev Account Layer Transactions Have To Be With Signature For
 *      Multi-Chains Syncture.
 */
abstract contract ModuleAuthBase {
    /**
     * @param _hash The Hash To Valdiate Signature
     * @param _signature The Transaction Signature
     * @return succ Whether The Signature is Valid
     * @return ownerWeight The Threshold Weight of Role Owner
     * @return assetsOpWeight The Threshold Weight Of Role AssetsOp
     * @return guardianWeight The Threshold Weight Of Role Guardian
     */
    function validateSignature(bytes32 _hash, bytes calldata _signature)
        public
        view
        virtual
        returns (
            bool succ,
            uint32 ownerWeight,
            uint32 assetsOpWeight,
            uint32 guardianWeight
        );

    function isValidKeysetHash(bytes32 _keysetHash) public view virtual returns (bool);

    function _updateKeysetHash(bytes32 _keysetHash) internal virtual;
}
