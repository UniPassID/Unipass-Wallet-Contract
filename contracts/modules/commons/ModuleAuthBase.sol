// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

/* solhint-disable no-unused-vars */

import "./ModuleDkimAuth.sol";
import "./ModuleTimeLock.sol";
import "./ModuleSelfAuth.sol";
import "./Implementation.sol";
import "../../utils/SigPart.sol";
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
    ModuleDkimAuth,
    Implementation,
    IERC1271,
    ModuleTimeLock,
    SignatureValidator
{
    using LibBytes for bytes;
    using Address for address;
    using LibSigType for SigType;

    constructor(IDkimKeys _dkimKeys)
        ModuleTimeLock()
        ModuleDkimAuth(_dkimKeys)
    {}

    //                       META_NONCE_KEY = keccak256("unipass-wallet:module-auth:meta-nonce")
    bytes32 private constant META_NONCE_KEY =
        bytes32(
            0x0ca6870aa26ec991ce7fe5a2fe6d18a240f46fa28d3c662b0a534d670d38ad09
        );

    //                       KEYSET_HASH_KEY = keccak256("unipass-wallet:module-auth:keyset-hash")
    bytes32 private constant KEYSET_HASH_KEY =
        bytes32(
            0x8771a5ac72b51506266988b53b9d8e36c46e1edb814d37bf2337d2f69e4ac9bc
        );

    uint256 private constant UPDATE_KEYSET_HASH = 0;
    uint256 private constant UNLOCK_KEYSET_HASH = 1;
    uint256 private constant CANCEL_LOCK_KEYSET_HASH = 2;
    uint256 private constant UPDATE_TIMELOCK_DURING = 3;
    uint256 private constant UPDATE_IMPLEMENTATION = 4;
    uint256 private constant UPDATE_ENTRY_POINT = 5;

    uint256 private constant EXPECTED_UPDATE_KEYSET_HASH_SIG_WEIGHT = 2;
    uint256 private constant EXPECTED_CANCEL_LOCK_KEYSET_HASH_SIG_WEIGHT = 2;
    uint256 private constant EXPECTED_UPDATE_TIMELOCK_DURINT_SIG_WEIGHT = 2;
    uint256 private constant EXPECTED_UPDATE_IMPLEMENTATION_SIG_WEIGHT = 3;
    uint256 private constant EXPECTED_UPDATE_ENTRY_POINT_SIG_WEIGHT = 3;

    bytes4 private constant SELECTOR_ERC1271_BYTES32_BYTES = 0x1626ba7e;

    event KeysetHashUpdated(bytes32 newKeysetHash);

    error InvalidActionType(uint256 _actionType);
    error InvalidImplementation(address _implementation);

    function isValidKeysetHash(bytes32 _keysetHash)
        public
        view
        virtual
        returns (bool);

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

    function _parseRecoveryEmail(
        bytes32 _hash,
        bytes calldata _signature,
        uint256 _index
    )
        internal
        view
        returns (
            bool validated,
            bytes32 emailHash,
            uint256 newIndex
        )
    {
        uint8 withDkimParams;
        newIndex = _index;
        withDkimParams = _signature.mcReadUint8(newIndex);
        newIndex++;
        uint8 inputEmailFromLen = _signature.mcReadUint8(newIndex);
        newIndex++;
        bytes memory inputEmailFrom = _signature[newIndex:newIndex +
            inputEmailFromLen];
        newIndex += inputEmailFromLen;
        if (withDkimParams == 1) {
            DkimParams memory params;
            (params, newIndex) = _parseDkimParams(_signature, newIndex);
            bool succ;
            bytes memory sigHashHex;
            (succ, emailHash, sigHashHex) = dkimVerify(params, inputEmailFrom);
            require(succ, "_parseRecoveryEmail: VALIDATE_FAILED");
            require(
                keccak256(LibBytes.toHex(uint256(_hash), 32)) ==
                    keccak256(sigHashHex),
                "_parseRecoveryEmail: INVALID_SIG_HASH"
            );
            validated = true;
        } else {
            emailHash = LibDkimValidator.emailAddressHash(inputEmailFrom);
        }
    }

    function _parseDkimParams(bytes calldata _signature, uint256 _index)
        internal
        pure
        returns (DkimParams memory params, uint256 newIndex)
    {
        uint32 emailHeaderLen;
        (emailHeaderLen, newIndex) = _signature.cReadUint32(_index);
        params.emailHeader = _signature[newIndex:newIndex + emailHeaderLen];
        newIndex += emailHeaderLen;
        uint32 dkimSigLen;
        (dkimSigLen, newIndex) = _signature.cReadUint32(newIndex);
        params.dkimSig = _signature[newIndex:newIndex + dkimSigLen];
        newIndex += dkimSigLen;
        (params.fromIndex, newIndex) = _signature.cReadUint32(newIndex);

        (params.fromLeftIndex, newIndex) = _signature.cReadUint32(newIndex);
        (params.fromRightIndex, newIndex) = _signature.cReadUint32(newIndex);
        (params.subjectIndex, newIndex) = _signature.cReadUint32(newIndex);
        (params.subjectRightIndex, newIndex) = _signature.cReadUint32(newIndex);
        uint32 isSubBase64Len;
        (isSubBase64Len, newIndex) = _signature.cReadUint32(newIndex);
        params.isSubBase64 = new bool[](isSubBase64Len);
        for (uint32 i = 0; i < isSubBase64Len; i++) {
            params.isSubBase64[i] = _signature.mcReadUint8(newIndex) == 1;
            newIndex++;
        }
        uint32 subjectPaddingLen;
        (subjectPaddingLen, newIndex) = _signature.cReadUint32(newIndex);
        params.subjectPadding = _signature[newIndex:newIndex +
            subjectPaddingLen];
        newIndex += subjectPaddingLen;
        uint32 subjectLen;
        (subjectLen, newIndex) = _signature.cReadUint32(newIndex);
        params.subject = new bytes[](subjectLen);
        for (uint32 i = 0; i < subjectLen; i++) {
            uint32 partLen;
            (partLen, newIndex) = _signature.cReadUint32(newIndex);
            params.subject[i] = _signature[newIndex:newIndex + partLen];
            newIndex += partLen;
        }
        (params.dkimHeaderIndex, newIndex) = _signature.cReadUint32(newIndex);
        (params.selectorIndex, newIndex) = _signature.cReadUint32(newIndex);
        (params.selectorRightIndex, newIndex) = _signature.cReadUint32(
            newIndex
        );
        (params.sdidIndex, newIndex) = _signature.cReadUint32(newIndex);
        (params.sdidRightIndex, newIndex) = _signature.cReadUint32(newIndex);
    }

    function _requireMetaNonce(uint256 _nonce) internal view {
        require(_isValidNonce(_nonce), "_requireMetaNonce: INVALID_META_NONCE");
    }

    function _isValidNonce(uint256 _nonce)
        internal
        view
        virtual
        returns (bool succ)
    {
        uint256 metaNonce = uint256(ModuleStorage.readBytes32(META_NONCE_KEY));
        succ = _nonce == metaNonce + 1;
    }

    function _validateSigMasterKey(
        bytes32 _digestHash,
        bytes calldata _signature,
        uint256 _index
    ) internal view returns (bool success) {
        address masterKey = recoverSigner(
            _digestHash,
            _signature[_index:_index + 66]
        );
        _index += 66;
        uint16 threshold;
        bytes32 recoveryEmail;
        (threshold, _index) = _signature.cReadUint16(_index);

        bytes32 keysetHash = keccak256(abi.encodePacked(masterKey, threshold));
        while (_index < _signature.length - 1) {
            recoveryEmail = _signature.mcReadBytes32(_index);
            _index += 32;
            keysetHash = keccak256(abi.encodePacked(keysetHash, recoveryEmail));
        }

        success = isValidKeysetHash(keysetHash);
    }

    function _toLockKeysetHash(bytes32 _keysetHash, uint256 _lockDuring)
        private
    {
        if (_lockDuring == 0) {
            _updateKeysetHash(_keysetHash);
        } else {
            _lockKeysetHash(_keysetHash);
        }
    }

    function _validateSigRecoveryEmail(
        bytes32 _digestHash,
        bytes calldata _signature,
        uint256 _index
    ) internal view returns (bool success) {
        address masterKey;
        (masterKey, _index) = _signature.cReadAddress(_index);
        uint16 threshold;
        bytes32 recoveryEmail;
        (threshold, _index) = _signature.cReadUint16(_index);

        bytes32 keysetHash = keccak256(abi.encodePacked(masterKey, threshold));
        bool validated;
        uint256 counts = 0;
        while (_index < _signature.length - 1) {
            (validated, recoveryEmail, _index) = _parseRecoveryEmail(
                _digestHash,
                _signature,
                _index
            );
            if (validated) {
                counts++;
            }
            keysetHash = keccak256(abi.encodePacked(keysetHash, recoveryEmail));
        }

        require(
            threshold <= counts,
            "_validateSigRecoveryEmail: NOT_ENOUGH_RECOVERY_EMAIL"
        );
        success = isValidKeysetHash(keysetHash);
    }

    function _validateSigMasterKeyWithRecoveryEmail(
        bytes32 _digestHash,
        bytes calldata _signature,
        uint256 _index
    ) internal view returns (bool success) {
        address masterKey = recoverSigner(
            _digestHash,
            _signature[_index:_index + 66]
        );
        _index += 66;
        uint16 threshold;
        bytes32 recoveryEmail;
        (threshold, _index) = _signature.cReadUint16(_index);

        bytes32 keysetHash = keccak256(abi.encodePacked(masterKey, threshold));
        bool validated;
        uint256 counts = 0;
        while (_index < _signature.length - 1) {
            (validated, recoveryEmail, _index) = _parseRecoveryEmail(
                _digestHash,
                _signature,
                _index
            );
            if (validated) {
                counts++;
            }
            keysetHash = keccak256(abi.encodePacked(keysetHash, recoveryEmail));
        }

        require(
            threshold <= counts,
            "_validateSigMasterKeyWithRecoveryEmail: NOT_ENOUGH_RECOVERY_EMAIL"
        );

        success = isValidKeysetHash(keysetHash);
    }

    function updateKeysetHash(
        uint32 _metaNonce,
        bytes32 _newKeysetHash,
        bytes calldata _signature
    ) external onlySelf {
        _requireMetaNonce(_metaNonce);
        _requireUnLocked();
        bytes32 digestHash = keccak256(
            abi.encodePacked(
                _metaNonce,
                address(this),
                uint8(UPDATE_KEYSET_HASH),
                _newKeysetHash
            )
        );

        (bool success, uint256 sigWeight) = validateSignatureWeight(
            EXPECTED_UPDATE_KEYSET_HASH_SIG_WEIGHT,
            digestHash,
            _signature
        );
        require(success, "_executeUpdateKeysetHash: INVALID_SIG_WEIGHT");

        if (sigWeight == EXPECTED_UPDATE_KEYSET_HASH_SIG_WEIGHT) {
            _toLockKeysetHash(_newKeysetHash, getLockDuring());
        } else {
            _updateKeysetHash(_newKeysetHash);
        }
        _writeMetaNonce(_metaNonce);
    }

    function unlockKeysetHash(uint256 _metaNonce) external {
        _requireMetaNonce(_metaNonce);
        _requireToUnLock();
        _updateKeysetHash(lockedKeysetHash);
        _unlockKeysetHash();
        _writeMetaNonce(_metaNonce);
    }

    function cancelLockKeysetHsah(uint32 _metaNonce, bytes calldata _signature)
        external
        onlySelf
    {
        _requireMetaNonce(_metaNonce);
        _requireLocked();
        bytes32 digestHash = keccak256(
            abi.encodePacked(
                _metaNonce,
                address(this),
                uint8(CANCEL_LOCK_KEYSET_HASH)
            )
        );

        (bool success, ) = validateSignatureWeight(
            EXPECTED_CANCEL_LOCK_KEYSET_HASH_SIG_WEIGHT,
            digestHash,
            _signature
        );
        require(success, "_executeCancelLockKeysetHsah: INVALID_SIG_WEIGHT");

        _unlockKeysetHash();
        _writeMetaNonce(_metaNonce);
    }

    function updateTimeLockDuring(
        uint32 _metaNonce,
        uint32 _newTimeLockDuring,
        bytes calldata _signature
    ) external onlySelf {
        _requireMetaNonce(_metaNonce);
        _requireUnLocked();

        bytes32 digestHash = keccak256(
            abi.encodePacked(
                _metaNonce,
                address(this),
                uint8(UPDATE_TIMELOCK_DURING),
                _newTimeLockDuring
            )
        );
        (bool success, ) = validateSignatureWeight(
            EXPECTED_UPDATE_TIMELOCK_DURINT_SIG_WEIGHT,
            digestHash,
            _signature
        );
        require(success, "_executeUpdateTimeLockDuring: INVALID_SIG_WEIGHT");
        _setLockDuring(_newTimeLockDuring);
        _writeMetaNonce(_metaNonce);
    }

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
            abi.encodePacked(
                _metaNonce,
                address(this),
                uint8(UPDATE_IMPLEMENTATION),
                _newImplementation
            )
        );
        (bool success, ) = validateSignatureWeight(
            EXPECTED_UPDATE_IMPLEMENTATION_SIG_WEIGHT,
            digestHash,
            _signature
        );
        require(success, "_executeUpdateImplement: INVALID_SIG_WEIGHT");
        _setImplementation(_newImplementation);
        _writeMetaNonce(_metaNonce);
    }

    function _validateSignature(
        SigType _sigType,
        bytes32 _hash,
        bytes calldata _signature,
        uint256 _index
    ) internal view returns (bool success) {
        if (_sigType == SigType.SigMasterKey) {
            success = _validateSigMasterKey(_hash, _signature, _index);
        } else if (_sigType == SigType.SigRecoveryEmail) {
            success = _validateSigRecoveryEmail(_hash, _signature, _index);
        } else if (_sigType == SigType.SigMasterKeyWithRecoveryEmail) {
            success = _validateSigMasterKeyWithRecoveryEmail(
                _hash,
                _signature,
                _index
            );
        } else if (_sigType == SigType.SigSessionKey) {
            success = _validateSigSessionKey(_hash, _signature, _index);
        } else if (_sigType == SigType.SigNone) {
            success = true;
        }
    }

    function validateSignatureWeight(
        uint256 _expectedSigWeight,
        bytes32 _hash,
        bytes calldata _signature
    ) public view returns (bool success, uint256 sigWeight) {
        uint256 index = 0;
        SigType sigType = SigType(_signature.mcReadUint8(index));
        sigWeight = sigType._toSignatureWeight();
        require(
            sigWeight >= _expectedSigWeight,
            "validateSignatureWeight: INVALID_SIG_WEIGHT"
        );
        index++;
        success = _validateSignature(sigType, _hash, _signature, index);
    }

    function _validateSigSessionKey(
        bytes32 _hash,
        bytes calldata _signature,
        uint256 _index
    ) internal view returns (bool success) {
        address sessionKey;
        (sessionKey, _index) = _signature.readAddress(_index);
        uint256 timestamp = uint256(_signature.mcReadBytes32(_index));
        _index += 32;
        require(
            block.timestamp < timestamp,
            "_validateSigSessionKey: INVALID_TIMESTAMP"
        );
        address recoverySessionKey = recoverSigner(
            _hash,
            _signature[_index:_index + 66]
        );
        _index += 66;
        require(
            sessionKey == recoverySessionKey,
            "_validateSigSessionKey: INVALID_SESSIONKEY"
        );

        bytes32 digestHash = keccak256(abi.encodePacked(sessionKey, timestamp));
        success = _validateSigMasterKey(digestHash, _signature, _index);
    }

    /**
     * @dev Should return whether the signature provided is valid for the provided data
     * @param _hash      Hash of the data to be signed
     * @param _signature Signature byte array associated with _data
     */
    function isValidSignature(bytes32 _hash, bytes calldata _signature)
        external
        view
        override
        returns (bytes4 magicValue)
    {
        // Validate signatures
        (bool isValid, ) = validateSignatureWeight(0, _hash, _signature);
        if (isValid) {
            magicValue = SELECTOR_ERC1271_BYTES32_BYTES;
        }
    }
}
