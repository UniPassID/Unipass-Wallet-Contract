// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

/* solhint-disable no-unused-vars */

import "./ModuleNonceBase.sol";
import "./ModuleDkimAuth.sol";
import "./ModuleTimeLock.sol";
import "./ModuleStorage.sol";
import "./ModuleKey.sol";
import "./Implementation.sol";
import "../../utils/SignatureValidator.sol";
import "../../interfaces/IModuleAuth.sol";

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/interfaces/IERC1271.sol";

import "hardhat/console.sol";

/**
 * @dev Account Layer Transactions Have To Be With Signature For
 *      Multi-Chains Syncture.
 */
abstract contract ModuleAuthBase is
    ModuleSelfAuth,
    IModuleAuth,
    ModuleNonceBase,
    ModuleDkimAuth,
    Implementation,
    IERC1271,
    ModuleTimeLock,
    SignatureValidator
{
    using LibBytes for bytes;
    using Address for address;

    constructor(IDkimKeys _dkimKeys) ModuleTimeLock() ModuleDkimAuth(_dkimKeys) {}

    //                       META_NONCE_KEY = keccak256("unipass-wallet:module-auth:meta-nonce")
    bytes32 private constant META_NONCE_KEY = bytes32(0x0ca6870aa26ec991ce7fe5a2fe6d18a240f46fa28d3c662b0a534d670d38ad09);

    //                       KEYSET_HASH_KEY = keccak256("unipass-wallet:module-auth:keyset-hash")
    bytes32 private constant KEYSET_HASH_KEY = bytes32(0x8771a5ac72b51506266988b53b9d8e36c46e1edb814d37bf2337d2f69e4ac9bc);

    uint256 private constant UPDATE_KEYSET_HASH = 0;
    uint256 private constant UNLOCK_KEYSET_HASH = 1;
    uint256 private constant CANCEL_LOCK_KEYSET_HASH = 2;
    uint256 private constant UPDATE_TIMELOCK_DURING = 3;
    uint256 private constant UPDATE_IMPLEMENTATION = 4;
    uint256 private constant SYNC_ACCOUNT = 6;
    uint256 private constant ZERO_CHAINID = 0;

    bytes4 private constant SELECTOR_ERC1271_BYTES32_BYTES = 0x1626ba7e;

    event UpdateKeysetHash(uint256 _metaNonce, bytes32 newKeysetHash);
    event UpdateKeysetHashWithTimeLock(uint256 _metaNonce, bytes32 newKeysetHash);
    event UnlockKeysetHash(uint256 _metaNonce);
    event CancelLockKeysetHsah(uint256 _metaNonce);
    event UpdateTimeLockDuring(uint256 _metaNonce, uint32 _newTimeLockDuring);
    event UpdateImplementation(uint256 _metaNonce, address _newImplementation);
    event SyncAccount(uint256 _metaNonce, bytes32 _newKeysetHash, uint32 _newTimeLockDuring, address newImplementation);

    error InvalidActionType(uint256 _actionType);
    error InvalidImplementation(address _implementation);
    error InvalidKeyType(KeyType _keyType);

    function isValidKeysetHash(bytes32 _keysetHash) public view virtual returns (bool);

    function _updateKeysetHash(bytes32 _keysetHash) internal virtual;

    function _writeMetaNonce(uint256 _nonce) private {
        ModuleStorage.writeBytes32(META_NONCE_KEY, bytes32(_nonce));
    }

    function _writeKeysetHash(bytes32 _keysetHash) internal {
        ModuleStorage.writeBytes32(KEYSET_HASH_KEY, _keysetHash);
    }

    function getKeysetHash() public view returns (bytes32 keysetHash) {
        keysetHash = ModuleStorage.readBytes32(KEYSET_HASH_KEY);
    }

    function getMetaNonce() public view returns (uint256) {
        uint256 metaNonce = uint256(ModuleStorage.readBytes32(META_NONCE_KEY));
        return metaNonce;
    }

    function _requireMetaNonce(uint256 _nonce) internal view {
        require(_isValidNonce(_nonce), "_requireMetaNonce: INVALID_META_NONCE");
    }

    function _isValidNonce(uint256 _nonce) internal view virtual returns (bool succ) {
        uint256 metaNonce = uint256(ModuleStorage.readBytes32(META_NONCE_KEY));
        succ = _nonce == metaNonce + 1;
    }

    function _toLockKeysetHash(bytes32 _keysetHash, uint256 _lockDuring) private {
        if (_lockDuring == 0) {
            _updateKeysetHash(_keysetHash);
        } else {
            _lockKeysetHash(_keysetHash);
        }
    }

    /**
     * @param _metaNonce The Account layer transaction Signature Nonce
     * @param _keysetHash The latest keysetHash in the Root Blockchain
     * @param _signature The internal signature of Accont layer transction
     */
    function syncAccount(
        uint32 _metaNonce,
        bytes32 _keysetHash,
        uint32 _newTimeLockDuring,
        address _newImplementation,
        bytes calldata _signature
    ) external override onlySelf {
        uint256 metaNonce = getMetaNonce();
        require(metaNonce < _metaNonce && metaNonce + 100 > _metaNonce, "syncAccount: INVALID_METANONCE");
        bytes32 digestHash = _subDigest(
            keccak256(abi.encodePacked(uint8(SYNC_ACCOUNT), _metaNonce, _keysetHash, _newTimeLockDuring, _newImplementation)),
            ZERO_CHAINID
        );

        (bool success, uint32 ownerWeight, , ) = validateSignature(digestHash, _signature);
        require(success, "syncAccount: INVALID_SIG");

        require(ownerWeight >= LibRole.OWNER_THRESHOLD, "syncAccount: INVALID_WEIGHT");
        if (!isValidKeysetHash(_keysetHash)) {
            _updateKeysetHash(_keysetHash);
        }
        if (_getLockDuring() != _newTimeLockDuring) {
            _setLockDuring(_newTimeLockDuring);
        }
        if (getImplementation() != _newImplementation) {
            _setImplementation(_newImplementation);
        }
        _writeMetaNonce(_metaNonce);

        emit SyncAccount(_metaNonce, _keysetHash, _newTimeLockDuring, _newImplementation);
    }

    /**
     * @param _metaNonce The Account layer transaction Signature Nonce
     * @param _newKeysetHash New KeysetHash
     * @param _signature The internal signature of Accont layer transction
     */
    function updateKeysetHash(
        uint32 _metaNonce,
        bytes32 _newKeysetHash,
        bytes calldata _signature
    ) external override onlySelf {
        _requireMetaNonce(_metaNonce);
        _requireUnLocked();
        bytes32 digestHash = _subDigest(
            keccak256(abi.encodePacked(uint8(UPDATE_KEYSET_HASH), _metaNonce, _newKeysetHash)),
            ZERO_CHAINID
        );

        (bool success, uint32 ownerWeight, , uint32 guardianWeight) = validateSignature(digestHash, _signature);
        require(success, "updateKeysetHash: INVALID_SIG");

        require(
            ownerWeight >= LibRole.OWNER_THRESHOLD || guardianWeight >= LibRole.GUARDIAN_THRESHOLD,
            "updateKeysetHash: INVALID_WEIGHT"
        );

        _updateKeysetHash(_newKeysetHash);
        _writeMetaNonce(_metaNonce);
        emit UpdateKeysetHash(_metaNonce, _newKeysetHash);
    }

    /**
     * @param _metaNonce The Account layer transaction Signature Nonce
     * @param _newKeysetHash New KeysetHash
     * @param _signature The internal signature of Accont layer transction
     */
    function updateKeysetHashWithTimeLock(
        uint32 _metaNonce,
        bytes32 _newKeysetHash,
        bytes calldata _signature
    ) external onlySelf {
        _requireMetaNonce(_metaNonce);
        _requireUnLocked();
        bytes32 digestHash = _subDigest(
            keccak256(abi.encodePacked(uint8(UPDATE_KEYSET_HASH), _metaNonce, _newKeysetHash)),
            ZERO_CHAINID
        );

        (bool success, , , uint32 guardianWeight) = validateSignature(digestHash, _signature);
        require(success, "updateKeysetHashWithTimeLock: INVALID_SIG");

        require(guardianWeight >= LibRole.GUARDIAN_TIMELOCK_THRESHOLD, "updateKeysetHashWithTimeLock: INVALID_WEIGHT");

        _toLockKeysetHash(_newKeysetHash, _getLockDuring());
        _writeMetaNonce(_metaNonce);

        emit UpdateKeysetHashWithTimeLock(_metaNonce, _newKeysetHash);
    }

    /**
     * @param _metaNonce The Account layer transaction Signature Nonce
     */
    function unlockKeysetHash(uint256 _metaNonce) external {
        _requireMetaNonce(_metaNonce);
        _requireToUnLock();
        _updateKeysetHash(_readLockedKeysetHash());
        _unlockKeysetHash();
        _writeMetaNonce(_metaNonce);

        emit UnlockKeysetHash(_metaNonce);
    }

    /**
     * @param _metaNonce The Account layer transaction Signature Nonce
     * @param _signature The internal signature of Accont layer transction
     */
    function cancelLockKeysetHsah(uint32 _metaNonce, bytes calldata _signature) external onlySelf {
        _requireMetaNonce(_metaNonce);
        _requireLocked();
        bytes32 digestHash = _subDigest(keccak256(abi.encodePacked(uint8(CANCEL_LOCK_KEYSET_HASH), _metaNonce)), ZERO_CHAINID);

        (bool success, uint32 ownerWeight, , ) = validateSignature(digestHash, _signature);
        require(success, "cancelLockKeysetHsah: INVALID_SIG");

        require(ownerWeight >= LibRole.OWNER_CANCEL_TIMELOCK_THRESHOLD, "cancelLockKeysetHsah: INVALID_WEIGHT");

        _unlockKeysetHash();
        _writeMetaNonce(_metaNonce);

        emit CancelLockKeysetHsah(_metaNonce);
    }

    /**
     * @param _metaNonce The Account layer transaction Signature Nonce
     * @param _newTimeLockDuring New TimeLock Lock During
     * @param _signature The internal signature of Accont layer transction
     */
    function updateTimeLockDuring(
        uint32 _metaNonce,
        uint32 _newTimeLockDuring,
        bytes calldata _signature
    ) external onlySelf {
        _requireMetaNonce(_metaNonce);
        _requireUnLocked();

        bytes32 digestHash = _subDigest(
            keccak256(abi.encodePacked(uint8(UPDATE_TIMELOCK_DURING), _metaNonce, _newTimeLockDuring)),
            ZERO_CHAINID
        );

        (bool success, uint32 ownerWeight, , ) = validateSignature(digestHash, _signature);
        require(success, "updateTimeLockDuring: INVALID_SIG");

        require(ownerWeight >= LibRole.OWNER_THRESHOLD, "updateTimeLockDuring: INVALID_WEIGHT");
        _setLockDuring(_newTimeLockDuring);
        _writeMetaNonce(_metaNonce);

        emit UpdateTimeLockDuring(_metaNonce, _newTimeLockDuring);
    }

    /**
     * @param _metaNonce The Account layer transaction Signature Nonce
     * @param _newImplementation New Contract Implemenation
     * @param _signature The internal signature of Accont layer transction
     */
    function updateImplementation(
        uint32 _metaNonce,
        address _newImplementation,
        bytes calldata _signature
    ) external onlySelf {
        _requireMetaNonce(_metaNonce);
        if (!_newImplementation.isContract()) revert InvalidImplementation(_newImplementation);

        bytes32 digestHash = _subDigest(
            keccak256(abi.encodePacked(uint8(UPDATE_IMPLEMENTATION), _metaNonce, _newImplementation)),
            ZERO_CHAINID
        );

        (bool success, uint32 ownerWeight, , ) = validateSignature(digestHash, _signature);
        require(success, "updateImplementation: INVALID_SIG");

        require(ownerWeight >= LibRole.OWNER_THRESHOLD, "updateImplementation: INVALID_WEIGHT");
        _setImplementation(_newImplementation);
        _writeMetaNonce(_metaNonce);

        emit UpdateImplementation(_metaNonce, _newImplementation);
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
            address sessionKey = recoverSigner(_hash, _signature[index:index + 66]);
            index += 66;
            bytes32 digestHash = _subDigest(keccak256(abi.encodePacked(sessionKey, timestamp, assetsOpWeight)), block.chainid);
            (bool success, , uint32 assetsOpWeightRet, ) = _validateSignatureInner(digestHash, _signature, index);
            succ = success && assetsOpWeightRet >= assetsOpWeight;
        } else {
            (succ, ownerWeight, assetsOpWeight, guardianWeight) = _validateSignatureInner(_hash, _signature, index);
        }
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
        KeyType keyType;
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
        if (keyType == KeyType.Secp256k1 || keyType == KeyType.ERC1271Wallet) {
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
            if (keyType == KeyType.Secp256k1 || keyType == KeyType.ERC1271Wallet) {
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

    function _parseKey(
        bytes32 _hash,
        bytes calldata _signature,
        uint256 _index
    )
        private
        view
        returns (
            bool isSig,
            KeyType keyType,
            bytes32 ret,
            uint256 index
        )
    {
        keyType = (KeyType)(_signature.mcReadUint8(_index));
        index = _index + 1;
        if (keyType == KeyType.Secp256k1) {
            address key;
            isSig = _signature.mcReadUint8(index) == 1;
            ++index;
            if (isSig) {
                key = recoverSigner(_hash, _signature[index:index + 66]);
                index += 66;
            } else {
                (key, index) = _signature.cReadAddress(index);
            }
            ret = bytes32(uint256(uint160(key)));
        } else if (keyType == KeyType.ERC1271Wallet) {
            isSig = _signature.mcReadUint8(index) == 1;
            ++index;
            address key;
            (key, index) = _signature.cReadAddress(index);
            if (isSig) {
                uint32 sigLen;
                (sigLen, index) = _signature.cReadUint32(index);
                bytes calldata sig = _signature[index:index + sigLen];
                index += sigLen;
                require(
                    IERC1271(key).isValidSignature(_hash, sig) == SELECTOR_ERC1271_BYTES32_BYTES,
                    "_validateSignature: VALIDATE_FAILED"
                );
            }
            ret = bytes32(uint256(uint160(key)));
        } else if (keyType == KeyType.EmailAddress) {
            isSig = _signature.mcReadUint8(index) == 1;
            ++index;

            if (isSig) {
                bool succ;
                bytes memory sigHashHex;
                bytes32 pepper = _signature.mcReadBytes32(index);
                index += 32;
                (succ, ret, sigHashHex, index) = _dkimVerify(_signature, index, pepper);
                require(succ, "_validateSignature: INVALID_DKIM");
                require(
                    keccak256((LibBytes.toHex(uint256(_hash), 32))) == keccak256(sigHashHex),
                    "_validateSignature: INVALID_SIG_HASH"
                );
            } else {
                ret = _signature.mcReadBytes32(index);
                index += 32;
            }
        } else {
            revert InvalidKeyType(keyType);
        }
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
            magicValue = SELECTOR_ERC1271_BYTES32_BYTES;
        }
    }

    function _subDigest(bytes32 _digest, uint256 _chainId) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", _chainId, address(this), _digest));
    }
}
