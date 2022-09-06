// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "./ModuleStorage.sol";
import "./ModuleAuthBase.sol";
import "../utils/LibUnipassSig.sol";
import "../../utils/LibSignatureValidator.sol";
import "../../utils/LibRole.sol";
import "../../interfaces/IDkimKeys.sol";

import "@openzeppelin/contracts/interfaces/IERC1271.sol";

import "hardhat/console.sol";

abstract contract ModuleAuth is ModuleAuthBase, IERC1271 {
    using LibBytes for bytes;

    IDkimKeys public immutable dkimKeys;

    constructor(IDkimKeys _dkimKeys) {
        require(address(_dkimKeys) != address(0), "INVALID_DKIMKEYS");
        dkimKeys = _dkimKeys;
    }

    //                       KEYSET_HASH_KEY = keccak256("unipass-wallet:module-auth:keyset-hash")
    bytes32 private constant KEYSET_HASH_KEY = bytes32(0x8771a5ac72b51506266988b53b9d8e36c46e1edb814d37bf2337d2f69e4ac9bc);

    function _writeKeysetHash(bytes32 _keysetHash) internal {
        ModuleStorage.writeBytes32(KEYSET_HASH_KEY, _keysetHash);
    }

    function getKeysetHash() public view returns (bytes32 keysetHash) {
        keysetHash = ModuleStorage.readBytes32(KEYSET_HASH_KEY);
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

    function _parseKey(
        bytes32 _hash,
        bytes calldata _signature,
        uint256 _index
    )
        private
        view
        returns (
            bool isSig,
            LibUnipassSig.KeyType keyType,
            bytes32 ret,
            uint256 index
        )
    {
        (isSig, keyType, ret, index) = LibUnipassSig._parseKey(dkimKeys, _hash, _signature, _index);
    }

    function _validateSignatureInner(
        bytes32 _hash,
        bytes calldata _signature,
        uint256 _index
    )
        private
        view
        returns (
            bool succ,
            uint32 ownerWeight,
            uint32 assetsOpWeight,
            uint32 guardianWeight
        )
    {
        bool isSig;
        LibUnipassSig.KeyType keyType;
        bytes32 ret;
        (isSig, keyType, ret, _index) = _parseKey(_hash, _signature, _index);
        uint32 singleOwnerWeight;
        uint32 singleAssetsOpWeight;
        uint32 singleGuardianWeight;
        (singleOwnerWeight, singleAssetsOpWeight, singleGuardianWeight, _index) = _parseRoleWeight(_signature, _index);
        if (isSig) {
            ownerWeight += singleOwnerWeight;
            assetsOpWeight += singleAssetsOpWeight;
            guardianWeight += singleGuardianWeight;
        }

        bytes32 keysetHash;
        if (keyType == LibUnipassSig.KeyType.Secp256k1 || keyType == LibUnipassSig.KeyType.ERC1271Wallet) {
            keysetHash = keccak256(
                abi.encodePacked(
                    keyType,
                    address(uint160(uint256(ret))),
                    singleOwnerWeight,
                    singleAssetsOpWeight,
                    singleGuardianWeight
                )
            );
        } else {
            keysetHash = keccak256(abi.encodePacked(keyType, ret, singleOwnerWeight, singleAssetsOpWeight, singleGuardianWeight));
        }
        while (_index < _signature.length - 1) {
            (isSig, keyType, ret, _index) = _parseKey(_hash, _signature, _index);
            (singleOwnerWeight, singleAssetsOpWeight, singleGuardianWeight, _index) = _parseRoleWeight(_signature, _index);
            if (isSig) {
                ownerWeight += singleOwnerWeight;
                assetsOpWeight += singleAssetsOpWeight;
                guardianWeight += singleGuardianWeight;
            }
            if (keyType == LibUnipassSig.KeyType.Secp256k1 || keyType == LibUnipassSig.KeyType.ERC1271Wallet) {
                keysetHash = keccak256(
                    abi.encodePacked(
                        keysetHash,
                        keyType,
                        address(uint160(uint256(ret))),
                        singleOwnerWeight,
                        singleAssetsOpWeight,
                        singleGuardianWeight
                    )
                );
            } else {
                keysetHash = keccak256(
                    abi.encodePacked(keysetHash, keyType, ret, singleOwnerWeight, singleAssetsOpWeight, singleGuardianWeight)
                );
            }
        }

        succ = isValidKeysetHash(keysetHash);
    }

    function _parseRoleWeight(bytes calldata _signature, uint256 _index)
        private
        pure
        returns (
            uint32 ownerWeight,
            uint32 assetsOpWeight,
            uint32 guardianWeight,
            uint256 index
        )
    {
        (ownerWeight, index) = _signature.cReadUint32(_index);
        (assetsOpWeight, index) = _signature.cReadUint32(index);
        (guardianWeight, index) = _signature.cReadUint32(index);
    }

    /**
     * @dev Should return whether the signature provided is valid for the provided data
     * @param _hash      Hash of the data to be signed
     * @param _signature Signature byte array associated with _data
     */
    function isValidSignature(bytes32 _hash, bytes calldata _signature) external view override returns (bytes4 magicValue) {
        // Validate signatures
        (bool isValid, , uint32 assetsOpWeight, ) = validateSignature(_hash, _signature);
        if (isValid && assetsOpWeight >= LibRole.ASSETS_OP_THRESHOLD) {
            magicValue = LibUnipassSig.SELECTOR_ERC1271_BYTES32_BYTES;
        }
    }
}
