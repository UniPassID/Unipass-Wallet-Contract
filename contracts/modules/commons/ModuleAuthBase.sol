// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "./ModuleDkimAuth.sol";
import "./ModuleTimeLock.sol";
import "./Implementation.sol";
import "../../utils/SigPart.sol";
import "../../utils/SignatureValidator.sol";

import "@openzeppelin/contracts/utils/Address.sol";

import "hardhat/console.sol";

abstract contract ModuleAuthBase is
    ModuleDkimAuth,
    Implementation,
    ModuleTimeLock,
    SignatureValidator
{
    using LibBytes for bytes;
    using Address for address;

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

    uint256 private constant UPDATE_KEYSET = 0;
    uint256 private constant UPDATE_TIMELOCK = 1;
    uint256 private constant UPDATE_IMPLEMENT = 2;

    event KeysetHashUpdated(bytes32 newKeysetHash);

    error InvalidActionType(uint256);
    error InvalidImplement(address);

    function _isValidKeysetHash(bytes32 _keysetHash)
        internal
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
        bytes memory inputEmailFrom;
        (inputEmailFrom, newIndex) = _signature.readBytes(
            newIndex,
            inputEmailFromLen
        );
        if (withDkimParams == 1) {
            DkimParams memory params;
            (params, newIndex) = _parseDkimParams(_signature, newIndex);
            bool succ;
            bytes memory sigHashHex;
            (succ, emailHash, sigHashHex) = dkimVerify(params, inputEmailFrom);
            require(succ, "IModuleAuth#_parseRecoveryEmail: VALIDATE_FAILED");
            require(
                keccak256(LibBytes.toHex(uint256(_hash), 32)) ==
                    keccak256(sigHashHex),
                "ModuleAuth#_parseRecoveryEmail: INVALID_SIG_HASH"
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
        (params.emailHeader, newIndex) = _signature.readBytes(
            newIndex,
            emailHeaderLen
        );
        uint32 dkimSigLen;
        (dkimSigLen, newIndex) = _signature.cReadUint32(newIndex);
        (params.dkimSig, newIndex) = _signature.readBytes(newIndex, dkimSigLen);
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
        (params.subjectPadding, newIndex) = _signature.readBytes(
            newIndex,
            subjectPaddingLen
        );
        uint32 subjectLen;
        (subjectLen, newIndex) = _signature.cReadUint32(newIndex);
        params.subject = new bytes[](subjectLen);
        for (uint32 i = 0; i < subjectLen; i++) {
            uint32 partLen;
            (partLen, newIndex) = _signature.cReadUint32(newIndex);
            (params.subject[i], newIndex) = _signature.readBytes(
                newIndex,
                partLen
            );
        }
        (params.dkimHeaderIndex, newIndex) = _signature.cReadUint32(newIndex);
        (params.selectorIndex, newIndex) = _signature.cReadUint32(newIndex);
        (params.selectorRightIndex, newIndex) = _signature.cReadUint32(
            newIndex
        );
        (params.sdidIndex, newIndex) = _signature.cReadUint32(newIndex);
        (params.sdidRightIndex, newIndex) = _signature.cReadUint32(newIndex);
    }

    function _isValidNonce(uint32 _nonce)
        internal
        view
        virtual
        returns (bool succ)
    {
        uint256 metaNonce = uint256(ModuleStorage.readBytes32(META_NONCE_KEY));
        succ = _nonce > metaNonce;
    }

    function _validateSigMasterKey(
        bytes32 _digestHash,
        bytes calldata _signature,
        uint256 _index
    ) internal pure returns (bytes32 keysetHash) {
        address masterKey = recoverSigner(
            _digestHash,
            _signature[_index:_index + 66]
        );
        _index += 66;
        uint16 threshold;
        bytes32 recoveryEmail;
        (threshold, _index) = _signature.cReadUint16(_index);

        keysetHash = keccak256(abi.encodePacked(masterKey, threshold));
        while (_index < _signature.length - 1) {
            recoveryEmail = _signature.mcReadBytes32(_index);
            _index += 32;
            keysetHash = keccak256(abi.encodePacked(keysetHash, recoveryEmail));
        }
    }

    function _checkPendNewKeysetHash(bytes32 _newKeysetHash) private {
        if (delay == 0) {
            _updateKeysetHash(_newKeysetHash);
        } else {
            _pendNewKeysetHash(_newKeysetHash);
        }
    }

    function _validateSigRecoveryEmail(
        bytes32 _digestHash,
        bytes calldata _signature,
        uint256 _index
    ) internal view returns (bytes32 keysetHash) {
        address masterKey;
        (masterKey, _index) = _signature.cReadAddress(_index);
        uint16 threshold;
        bytes32 recoveryEmail;
        (threshold, _index) = _signature.cReadUint16(_index);

        keysetHash = keccak256(abi.encodePacked(masterKey, threshold));
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
            "ModuleAuth#_validateSigRecoveryEmail: NOT_ENOUGH_RECOVERY_EMAIL"
        );
    }

    function _validateSigMasterKeyWithRecoveryEmail(
        bytes32 _digestHash,
        bytes calldata _signature,
        uint256 _index
    ) internal view returns (bytes32 keysetHash) {
        address masterKey = recoverSigner(
            _digestHash,
            _signature[_index:_index + 66]
        );
        _index += 66;
        uint16 threshold;
        bytes32 recoveryEmail;
        (threshold, _index) = _signature.cReadUint16(_index);

        keysetHash = keccak256(abi.encodePacked(masterKey, threshold));
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
            "ModuleAuth#_validateSigRecoveryEmail: NOT_ENOUGH_RECOVERY_EMAIL"
        );
    }

    function executeAccountTx(bytes calldata _input) public {
        uint32 metaNonce;
        (uint8 actionType, uint256 leftIndex) = _input.readFirstUint8();
        SigType sigType;
        (metaNonce, leftIndex) = _input.cReadUint32(leftIndex);
        require(
            _isValidNonce(metaNonce),
            "ModuleAuth#executeAccountTx: INVALID_NONCE"
        );

        bytes32 keysetHash;
        if (actionType == UPDATE_KEYSET) {
            bytes32 newKeysetHash = _input.mcReadBytes32(leftIndex);
            leftIndex += 32;
            bytes32 digestHash = keccak256(
                abi.encodePacked(metaNonce, address(this), newKeysetHash)
            );
            sigType = SigType(_input.mcReadUint8(leftIndex));
            leftIndex++;

            if (sigType == SigType.SigMasterKey) {
                _requireUnPending();
                keysetHash = _validateSigMasterKey(
                    digestHash,
                    _input,
                    leftIndex
                );
                require(
                    _isValidKeysetHash(keysetHash),
                    "ModuleAuth#validateSignature: INVALID_KEYSET"
                );
                _checkPendNewKeysetHash(newKeysetHash);
            } else if (sigType == SigType.SigRecoveryEmail) {
                _requireUnPending();
                keysetHash = _validateSigRecoveryEmail(
                    digestHash,
                    _input,
                    leftIndex
                );
                require(
                    _isValidKeysetHash(keysetHash),
                    "ModuleAuth#validateSignature: INVALID_KEYSET"
                );
                _checkPendNewKeysetHash(newKeysetHash);
            } else if (sigType == SigType.SigMasterKeyWithRecoveryEmail) {
                keysetHash = _validateSigMasterKeyWithRecoveryEmail(
                    digestHash,
                    _input,
                    leftIndex
                );
                require(
                    _isValidKeysetHash(keysetHash),
                    "ModuleAuth#validateSignature: INVALID_KEYSET"
                );
                _updateKeysetHash(newKeysetHash);
                _writeMetaNonce(metaNonce);
            }
        } else if (actionType == UPDATE_TIMELOCK) {
            uint32 newDelay;
            (newDelay, leftIndex) = _input.cReadUint32(leftIndex);
            bytes32 digestHash = keccak256(
                abi.encodePacked(metaNonce, address(this), newDelay)
            );
            keysetHash = _validateSigMasterKeyWithRecoveryEmail(
                digestHash,
                _input,
                leftIndex
            );
            require(
                _isValidKeysetHash(keysetHash),
                "ModuleAuth#validateSignature: INVALID_KEYSET"
            );
            _setDelay(newDelay);
            _writeMetaNonce(metaNonce);
        } else if (actionType == UPDATE_IMPLEMENT) {
            address newImplement;
            (newImplement, leftIndex) = _input.cReadAddress(leftIndex);
            if (!newImplement.isContract()) {
                revert InvalidImplement(newImplement);
            }
            bytes32 digestHash = keccak256(
                abi.encodePacked(metaNonce, address(this), newImplement)
            );
            keysetHash = _validateSigMasterKeyWithRecoveryEmail(
                digestHash,
                _input,
                leftIndex
            );
            require(
                _isValidKeysetHash(keysetHash),
                "ModuleAuth#validateSignature: INVALID_KEYSET"
            );
            _setImplementation(newImplement);
        } else {
            revert InvalidActionType(actionType);
        }
    }

    function isValidSignature(
        SigType _sigType,
        bytes32 _hash,
        bytes calldata _signature,
        uint256 _index
    ) public view returns (bool success) {
        bytes32 keysetHash;
        if (_sigType == SigType.SigMasterKey) {
            keysetHash = _validateSigMasterKey(_hash, _signature, _index);
            success = _isValidKeysetHash(keysetHash);
        } else if (_sigType == SigType.SigRecoveryEmail) {
            keysetHash = _validateSigRecoveryEmail(_hash, _signature, _index);
            success = _isValidKeysetHash(keysetHash);
        } else if (_sigType == SigType.SigMasterKeyWithRecoveryEmail) {
            keysetHash = _validateSigMasterKeyWithRecoveryEmail(
                _hash,
                _signature,
                _index
            );
            success = _isValidKeysetHash(keysetHash);
        } else if (_sigType == SigType.SigSessionKey) {
            success = _validateSigSessionKey(_hash, _signature, _index);
        } else if (_sigType == SigType.SigNone) {
            success = true;
        }
    }

    function _validateSigSessionKey(
        bytes32 _hash,
        bytes calldata _signature,
        uint256 _index
    ) internal view returns (bool) {
        address sessionKey;
        (sessionKey, _index) = _signature.readAddress(_index);
        uint256 timestamp = uint256(_signature.mcReadBytes32(_index));
        _index += 32;
        require(
            block.timestamp < timestamp,
            "ModuleAuth#_validateSigSessionKey: INVALID_TIMESTAMP"
        );
        address recoverySessionKey = recoverSigner(
            _hash,
            _signature[_index:_index + 66]
        );
        _index += 66;
        require(
            sessionKey == recoverySessionKey,
            "ModuleAuth#_validateSigSessionKey: INVALID_SESSIONKEY"
        );

        bytes32 digestHash = keccak256(abi.encodePacked(sessionKey, timestamp));
        bytes32 keysetHash = _validateSigMasterKey(
            digestHash,
            _signature,
            _index
        );
        return _isValidKeysetHash(keysetHash);
    }
}
