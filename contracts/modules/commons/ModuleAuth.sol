// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "./ModuleSelfAuth.sol";
import "./ModuleDkimAuth.sol";
import "./ModuleFactoryAuth.sol";
import "./ModuleStorage.sol";
import "./ModuleTimeLock.sol";
import "./Implementation.sol";
import "../../utils/SignatureValidator.sol";
import "../../Wallet.sol";

contract ModuleAuth is
    ModuleDkimAuth,
    SignatureValidator,
    Implementation,
    ModuleTimeLock,
    ModuleSelfAuth,
    ModuleFactoryAuth
{
    using LibBytes for bytes;

    error InvalidSignatureType(uint8);

    //                       KEY_SET_KEY = keccak256("unipass-wallet:module-auth:keyset")
    bytes32 private constant KEY_SET_KEY =
        bytes32(
            0x85859b18ed2df2b64a05fc42eefd089dd1e7c78ae16d94060a1316577070f2c2
        );
    // bytes32 private constant META_NONCE_KEY = keccak256("unipass-wallet:module-auth:meta-nonce")
    bytes32 private constant META_NONCE_KEY =
        bytes32(
            0x0ca6870aa26ec991ce7fe5a2fe6d18a240f46fa28d3c662b0a534d670d38ad09
        );

    bytes32 public immutable INIT_CODE_HASH;

    uint256 private constant UPDATE_KEYSET = 0;
    uint256 private constant UPDATE_TIMELOCK = 1;

    uint256 private constant SIG_MASKTER_KEY = 0;
    uint256 private constant SIG_RECOVERY_EMAIL = 1;
    uint256 private constant SIG_MASKTER_KEY_WITH_RECOVERY_EMAIL = 2;

    event KeySetUpdated(bytes32 newKeySet);

    constructor(address _factory) ModuleFactoryAuth(_factory) ModuleTimeLock() {
        INIT_CODE_HASH = keccak256(
            abi.encodePacked(
                Wallet.creationCode,
                uint256(uint160(address(this)))
            )
        );
    }

    function init(IDkimKeys _dkimKeys, bytes32 _keySet)
        external
        payable
        onlyFactory
    {
        require(_keySet != bytes32(0), "ModuleAuth#init: ZERO_KEYSET");
        bytes32 salt = keccak256(abi.encodePacked(_keySet, _dkimKeys));
        require(
            address(
                uint160(
                    uint256(
                        keccak256(
                            abi.encodePacked(
                                hex"ff",
                                FACTORY,
                                salt,
                                INIT_CODE_HASH
                            )
                        )
                    )
                )
            ) == address(this),
            "ModuleAuth#constructor: INVALID_KEYSET"
        );
        ModuleStorage.writeBytes32(KEY_SET_KEY, _keySet);
        dkimKeys = _dkimKeys;
    }

    /**
     * @notice Updates the signers configuration of the wallet
     * @param _keySet New required image hash of the signature
     * @dev It is recommended to not have more than 200 signers as opcode repricing
     *      could make transactions impossible to execute as all the signers must be
     *      passed for each transaction.
     */
    function updateKeySet(bytes32 _keySet) internal {
        require(
            _keySet != bytes32(0),
            "ModuleAuth#updateKeySet INVALID_KEYSET"
        );
        ModuleStorage.writeBytes32(KEY_SET_KEY, _keySet);
        emit KeySetUpdated(_keySet);
    }

    function getKeySet() external view returns (bytes32 keySet) {
        keySet = ModuleStorage.readBytes32(KEY_SET_KEY);
    }

    function recoverySigner(bytes32 _hash, bytes calldata _signature)
        external
        pure
        returns (address)
    {
        return super.recoverSigner(_hash, _signature);
    }

    function getNonce() public view returns (uint256) {
        uint256 metaNonce = uint256(ModuleStorage.readBytes32(META_NONCE_KEY));
        return metaNonce;
    }

    function _writeNonce(uint256 _nonce) internal {
        ModuleStorage.writeBytes32(META_NONCE_KEY, bytes32(_nonce));
    }

    function _isValidNonce(uint32 _nonce) internal view returns (bool succ) {
        uint256 metaNonce = uint256(ModuleStorage.readBytes32(META_NONCE_KEY));
        succ = _nonce > metaNonce;
    }

    function validateSignature(bytes32 _hash, bytes calldata _signature)
        external
    {
        uint32 metaNonce;
        (uint8 actionType, uint256 leftIndex) = _signature.readFirstUint8();
        uint8 sigType;
        (metaNonce, leftIndex) = _signature.cReadUint32(leftIndex);
        require(
            _isValidNonce(metaNonce),
            "ModuleAuth#isValidSignature: INVALID_NONCE"
        );

        bytes32 keySet;
        if (actionType == UPDATE_KEYSET) {
            bytes32 digestHash = keccak256(
                abi.encodePacked(metaNonce, address(this), _hash)
            );
            sigType = _signature.mcReadUint8(leftIndex);
            leftIndex++;

            if (sigType == SIG_MASKTER_KEY) {
                _requireUnPending();
                keySet = _validateSigMasterKey(
                    digestHash,
                    _signature,
                    leftIndex
                );
                require(
                    _isValidKeySet(keySet),
                    "ModuleAuth#validateSignature: INVALID_KEYSET"
                );
                _pendNewKeySet(_hash);
            } else if (sigType == SIG_RECOVERY_EMAIL) {
                _requireUnPending();
                keySet = _validateSigRecoveryEmail(
                    digestHash,
                    _signature,
                    leftIndex
                );
                require(
                    _isValidKeySet(keySet),
                    "ModuleAuth#validateSignature: INVALID_KEYSET"
                );
                _pendNewKeySet(_hash);
            } else if (sigType == SIG_MASKTER_KEY_WITH_RECOVERY_EMAIL) {
                keySet = _validateSigMasterKeyWithRecoveryEmail(
                    digestHash,
                    _signature,
                    leftIndex
                );
                require(
                    _isValidKeySet(keySet),
                    "ModuleAuth#validateSignature: INVALID_KEYSET"
                );
                updateKeySet(_hash);
                _writeNonce(metaNonce);
            } else {
                revert InvalidSignatureType(sigType);
            }
        } else if (actionType == UPDATE_TIMELOCK) {
            uint32 newDelay;
            (newDelay, leftIndex) = _signature.cReadUint32(leftIndex);
            require(
                _hash ==
                    keccak256(
                        abi.encodePacked(metaNonce, address(this), newDelay)
                    ),
                "ModuleAuth#validateSignature: INVALID_HASH"
            );
            keySet = _validateSigMasterKeyWithRecoveryEmail(
                _hash,
                _signature,
                leftIndex
            );
            require(
                _isValidKeySet(keySet),
                "ModuleAuth#validateSignature: INVALID_KEYSET"
            );
            _setDelay(newDelay);
            _writeNonce(metaNonce);
        }
    }

    function _isValidKeySet(bytes32 _keySet) internal view returns (bool) {
        return
            _keySet != bytes32(0) &&
            ModuleStorage.readBytes32(KEY_SET_KEY) == _keySet;
    }

    function _validateSigMasterKey(
        bytes32 _digestHash,
        bytes calldata _signature,
        uint256 _index
    ) internal view returns (bytes32 keySet) {
        bytes memory sig;
        (sig, _index) = _signature.readBytes66(_index);
        address masterKey = this.recoverySigner(_digestHash, sig);
        uint16 threshold;
        bytes32 recoveryEmail;
        (threshold, _index) = _signature.cReadUint16(_index);

        keySet = keccak256(abi.encodePacked(masterKey, threshold));
        while (_index < _signature.length - 1) {
            recoveryEmail = _signature.mcReadBytes32(_index);
            _index += 32;
            keySet = keccak256(abi.encodePacked(keySet, recoveryEmail));
        }
    }

    function _validateSigRecoveryEmail(
        bytes32 _digestHash,
        bytes calldata _signature,
        uint256 _index
    ) internal view returns (bytes32 keySet) {
        address masterKey;
        (masterKey, _index) = _signature.cReadAddress(_index);
        uint16 threshold;
        bytes32 recoveryEmail;
        (threshold, _index) = _signature.cReadUint16(_index);

        keySet = keccak256(abi.encodePacked(masterKey, threshold));
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
            keySet = keccak256(abi.encodePacked(keySet, recoveryEmail));
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
    ) internal view returns (bytes32 keySet) {
        bytes memory sig;
        (sig, _index) = _signature.readBytes66(_index);
        address masterKey = this.recoverySigner(_digestHash, sig);
        uint16 threshold;
        bytes32 recoveryEmail;
        (threshold, _index) = _signature.cReadUint16(_index);

        keySet = keccak256(abi.encodePacked(masterKey, threshold));
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
            keySet = keccak256(abi.encodePacked(keySet, recoveryEmail));
        }

        require(
            threshold <= counts,
            "ModuleAuth#_validateSigRecoveryEmail: NOT_ENOUGH_RECOVERY_EMAIL"
        );
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
            bytes32 recoveryEmail,
            uint256 newIndex
        )
    {
        uint8 withDkimParams;
        newIndex = _index;
        withDkimParams = _signature.mcReadUint8(newIndex);
        newIndex++;
        recoveryEmail = _signature.mcReadBytes32(newIndex);
        newIndex += 32;
        if (withDkimParams == 1) {
            DkimParams memory params;
            (params, newIndex) = _parseDkimParams(_signature, newIndex);
            (bool succ, bytes32 emailHash, bytes memory sigHashHex) = this
                .dkimVerify(params);
            require(succ, "ModuleAuth#_parseRecoveryEmail: VALIDATE_FAILED");
            require(
                emailHash == recoveryEmail,
                "ModuleAuth#_parseRecoveryEmail: INVALID_EMAIL"
            );
            require(
                keccak256(LibBytes.toHex(uint256(_hash), 32)) ==
                    keccak256(sigHashHex),
                "ModuleAuth#_parseRecoveryEmail: INVALID_SIG_HASH"
            );
            validated = true;
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
}
