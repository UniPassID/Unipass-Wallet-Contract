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

    bytes4 private constant SELECTOR_ERC1271_BYTES32_BYTES = 0x1626ba7e;

    event KeysetHashUpdated(bytes32 newKeysetHash);

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
        bytes calldata _signature
    ) external override onlySelf {
        uint256 metaNonce = getMetaNonce();
        require(metaNonce < _metaNonce && metaNonce + 100 > _metaNonce, "syncAccount: INVALID_METANONCE");
        bytes32 digestHash = keccak256(abi.encodePacked(_metaNonce, address(this), uint8(SYNC_ACCOUNT), _keysetHash));

        (bool success, RoleWeight memory roleWeight) = validateSignature(digestHash, _signature);
        require(success, "syncAccount: INVALID_SIG");

        require(roleWeight.ownerWeight >= LibRole.OWNER_THRESHOLD, "syncAccount: INVALID_WEIGHT");
        _updateKeysetHash(_keysetHash);
        _writeMetaNonce(_metaNonce);
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
        bytes32 digestHash = keccak256(abi.encodePacked(_metaNonce, address(this), uint8(UPDATE_KEYSET_HASH), _newKeysetHash));

        (bool success, RoleWeight memory roleWeight) = validateSignature(digestHash, _signature);
        require(success, "updateKeysetHash: INVALID_SIG");

        require(
            roleWeight.ownerWeight >= LibRole.OWNER_THRESHOLD || roleWeight.guardianWeight >= LibRole.GUARDIAN_THRESHOLD,
            "updateKeysetHash: INVALID_WEIGHT"
        );

        _updateKeysetHash(_newKeysetHash);
        _writeMetaNonce(_metaNonce);
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
        bytes32 digestHash = keccak256(abi.encodePacked(_metaNonce, address(this), uint8(UPDATE_KEYSET_HASH), _newKeysetHash));

        (bool success, RoleWeight memory roleWeight) = validateSignature(digestHash, _signature);
        require(success, "updateKeysetHashWithTimeLock: INVALID_SIG");

        require(roleWeight.guardianWeight >= LibRole.GUARDIAN_TIMELOCK_THRESHOLD, "updateKeysetHashWithTimeLock: INVALID_WEIGHT");

        _toLockKeysetHash(_newKeysetHash, getLockDuring());
        _writeMetaNonce(_metaNonce);
    }

    /**
     * @param _metaNonce The Account layer transaction Signature Nonce
     */
    function unlockKeysetHash(uint256 _metaNonce) external {
        _requireMetaNonce(_metaNonce);
        _requireToUnLock();
        _updateKeysetHash(lockedKeysetHash);
        _unlockKeysetHash();
        _writeMetaNonce(_metaNonce);
    }

    /**
     * @param _metaNonce The Account layer transaction Signature Nonce
     * @param _signature The internal signature of Accont layer transction
     */
    function cancelLockKeysetHsah(uint32 _metaNonce, bytes calldata _signature) external onlySelf {
        _requireMetaNonce(_metaNonce);
        _requireLocked();
        bytes32 digestHash = keccak256(abi.encodePacked(_metaNonce, address(this), uint8(CANCEL_LOCK_KEYSET_HASH)));

        (bool success, RoleWeight memory roleWeight) = validateSignature(digestHash, _signature);
        require(success, "cancelLockKeysetHsah: INVALID_SIG");

        require(roleWeight.ownerWeight >= LibRole.OWNER_CANCEL_TIMELOCK_THRESHOLD, "cancelLockKeysetHsah: INVALID_WEIGHT");

        _unlockKeysetHash();
        _writeMetaNonce(_metaNonce);
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

        bytes32 digestHash = keccak256(
            abi.encodePacked(_metaNonce, address(this), uint8(UPDATE_TIMELOCK_DURING), _newTimeLockDuring)
        );
        (bool success, RoleWeight memory roleWeight) = validateSignature(digestHash, _signature);
        require(success, "updateTimeLockDuring: INVALID_SIG");

        require(roleWeight.ownerWeight > LibRole.OWNER_THRESHOLD, "updateTimeLockDuring: INVALID_WEIGHT");
        _setLockDuring(_newTimeLockDuring);
        _writeMetaNonce(_metaNonce);
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
        if (!_newImplementation.isContract()) {
            revert InvalidImplementation(_newImplementation);
        }
        bytes32 digestHash = keccak256(
            abi.encodePacked(_metaNonce, address(this), uint8(UPDATE_IMPLEMENTATION), _newImplementation)
        );

        (bool success, RoleWeight memory roleWeight) = validateSignature(digestHash, _signature);
        require(success, "updateImplementation: INVALID_SIG");

        require(roleWeight.ownerWeight > LibRole.OWNER_THRESHOLD, "updateImplementation: INVALID_WEIGHT");
        _setImplementation(_newImplementation);
        _writeMetaNonce(_metaNonce);
    }

    /**
     * @param _hash The Hash To Valdiate Signature
     * @param _signature The Transaction Signature
     * @return succ Whether The Signature is Valid
     * @return roleWeightRet The Role And Signature Weight
     */
    function validateSignature(bytes32 _hash, bytes calldata _signature)
        public
        view
        override
        returns (bool succ, RoleWeight memory roleWeightRet)
    {
        if (_signature.length == 0) {
            return (true, roleWeightRet);
        }
        uint256 index = 0;
        bool isSessionKey = _signature.mcReadUint8(index) == 1;
        index++;
        RoleWeight memory roleWeight;

        if (isSessionKey) {
            uint32 timestamp;
            (timestamp, index) = _signature.cReadUint32(index);
            require(block.timestamp < timestamp, "_validateSignature: INVALID_TIMESTAMP");
            (roleWeightRet.assetsOpWeight, index) = _signature.cReadUint32(index);
            address sessionKey = recoverSigner(_hash, _signature[index:index + 66]);
            index += 66;
            bytes32 digestHash = keccak256(abi.encodePacked(sessionKey, timestamp, roleWeightRet.assetsOpWeight));
            bool success;
            (success, roleWeight) = _validateSignatureInner(digestHash, _signature, index);
            succ = success && roleWeightRet.assetsOpWeight <= roleWeight.assetsOpWeight;
        } else {
            (succ, roleWeightRet) = _validateSignatureInner(_hash, _signature, index);
        }
    }

    function _validateSignatureInner(
        bytes32 _hash,
        bytes calldata _signature,
        uint256 _index
    ) private view returns (bool succ, RoleWeight memory roleWeightSum) {
        bytes32 keysetHash;
        bool isSig;
        KeyType keyType;
        address key;
        bytes32 emailHash;
        RoleWeight memory roleWeight;
        (isSig, keyType, key, emailHash, _index) = _parseKey(_hash, _signature, _index);
        (roleWeight, _index) = _parseRoleWeight(_signature, _index);
        if (isSig) {
            roleWeightSum.ownerWeight += roleWeight.ownerWeight;
            roleWeightSum.assetsOpWeight += roleWeight.assetsOpWeight;
            roleWeightSum.guardianWeight += roleWeight.guardianWeight;
        }
        if (keyType == KeyType.Secp256k1 || keyType == KeyType.ERC1271Wallet) {
            keysetHash = keccak256(
                abi.encodePacked(keyType, key, roleWeight.ownerWeight, roleWeight.assetsOpWeight, roleWeight.guardianWeight)
            );
        } else {
            keysetHash = keccak256(
                abi.encodePacked(keyType, emailHash, roleWeight.ownerWeight, roleWeight.assetsOpWeight, roleWeight.guardianWeight)
            );
        }
        while (_index < _signature.length - 1) {
            (isSig, keyType, key, emailHash, _index) = _parseKey(_hash, _signature, _index);
            (roleWeight, _index) = _parseRoleWeight(_signature, _index);
            if (isSig) {
                roleWeightSum.ownerWeight += roleWeight.ownerWeight;
                roleWeightSum.assetsOpWeight += roleWeight.assetsOpWeight;
                roleWeightSum.guardianWeight += roleWeight.guardianWeight;
            }
            if (keyType == KeyType.Secp256k1 || keyType == KeyType.ERC1271Wallet) {
                keysetHash = keccak256(
                    abi.encodePacked(
                        keysetHash,
                        keyType,
                        key,
                        roleWeight.ownerWeight,
                        roleWeight.assetsOpWeight,
                        roleWeight.guardianWeight
                    )
                );
            } else {
                keysetHash = keccak256(
                    abi.encodePacked(
                        keysetHash,
                        keyType,
                        emailHash,
                        roleWeight.ownerWeight,
                        roleWeight.assetsOpWeight,
                        roleWeight.guardianWeight
                    )
                );
            }
        }

        succ = isValidKeysetHash(keysetHash);
    }

    function _parseRoleWeight(bytes calldata _signature, uint256 _index)
        private
        pure
        returns (RoleWeight memory roleWeight, uint256 index)
    {
        (roleWeight.ownerWeight, index) = _signature.cReadUint32(_index);
        (roleWeight.assetsOpWeight, index) = _signature.cReadUint32(index);
        (roleWeight.guardianWeight, index) = _signature.cReadUint32(index);
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
            address key,
            bytes32 emailHash,
            uint256 index
        )
    {
        keyType = (KeyType)(_signature.mcReadUint8(_index));
        index = _index + 1;
        if (keyType == KeyType.Secp256k1) {
            isSig = _signature.mcReadUint8(index) == 1;
            index++;
            if (isSig) {
                key = recoverSigner(_hash, _signature[index:index + 66]);
                index += 66;
            } else {
                (key, index) = _signature.cReadAddress(index);
            }
        } else if (keyType == KeyType.ERC1271Wallet) {
            (key, index) = _signature.cReadAddress(index);
            isSig = _signature.mcReadUint8(index) == 1;
            index++;
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
        } else if (keyType == KeyType.EmailAddress) {
            isSig = _signature.mcReadUint8(index) == 1;
            index++;
            uint32 emailFromLen;
            (emailFromLen, index) = _signature.cReadUint32(index);
            bytes calldata emailFrom = _signature[index:index + emailFromLen];
            index += emailFromLen;
            if (isSig) {
                bool succ;
                bytes memory sigHashHex;
                (succ, emailHash, sigHashHex, index) = _dkimVerify(_signature, index, emailFrom);
                require(succ, "_validateSignature: INVALID_DKIM");
                require(
                    keccak256((LibBytes.toHex(uint256(_hash), 32))) == keccak256(sigHashHex),
                    "_validateSignature: INVALID_SIG_HASH"
                );
            } else {
                emailHash = LibDkimValidator.emailAddressHash(emailFrom);
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
        (bool isValid, RoleWeight memory roleWeight) = validateSignature(_hash, _signature);
        if (isValid && roleWeight.assetsOpWeight >= LibRole.ASSETS_OP_THRESHOLD) {
            magicValue = SELECTOR_ERC1271_BYTES32_BYTES;
        }
    }
}
