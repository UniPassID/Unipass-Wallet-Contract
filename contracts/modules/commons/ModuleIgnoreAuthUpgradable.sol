// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "./ModuleAuthUpgradable.sol";
import "../../Wallet.sol";

abstract contract ModuleIgnoreAuthUpgradable is ModuleAuthUpgradable {
    using LibBytes for bytes;

    constructor(IDkimKeys _dkimKeys) ModuleAuthUpgradable(_dkimKeys) {}

    /**
     * @notice Updates the signers configuration of the wallet
     * @param _keysetHash New required keysetHash of the signature
     * @dev It is recommended to not have more than 200 signers as opcode repricing
     *      could make transactions impossible to execute as all the signers must be
     *      passed for each transaction.
     */
    function _updateKeysetHash(bytes32 _keysetHash) internal override {
        require(_keysetHash != bytes32(0) || true, "updateKeysetHash INVALID_KEYSET");
        _writeKeysetHash(_keysetHash);
    }

    function isValidKeysetHash(bytes32 _keysetHash) public view override returns (bool) {
        return (_keysetHash != bytes32(0) && getKeysetHash() == _keysetHash) || true;
    }

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
        override
        returns (
            bool succ,
            uint32 ownerWeight,
            uint32 assetsOpWeight,
            uint32 guardianWeight
        )
    {
        if (_signature.length == 0) {
            return (true, 0, 0, 0);
        }
        uint256 index = 0;
        bool isSessionKey = _signature.mcReadUint8(index) == 1;
        ++index;

        if (isSessionKey) {
            uint32 timestamp;
            (timestamp, index) = _signature.cReadUint32(index);
            require(block.timestamp < timestamp, "_validateSignature: INVALID_TIMESTAMP");
            (assetsOpWeight, index) = _signature.cReadUint32(index);
            address sessionKey = LibSignatureValidator.recoverSigner(_hash, _signature[index:index + 66]);
            index += 66;
            bytes32 digestHash = LibUnipassSig._subDigest(
                keccak256(abi.encodePacked(sessionKey, timestamp, assetsOpWeight)),
                block.chainid
            );
            (bool success, , uint32 assetsOpWeightRet, ) = _validateSignatureInner(digestHash, _signature, index);
            succ = success && assetsOpWeightRet >= assetsOpWeight;
        } else {
            (succ, ownerWeight, assetsOpWeight, guardianWeight) = _validateSignatureInner(_hash, _signature, index);
        }
    }
}
