// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "./ModuleDkimAuth.sol";
import "./ModuleFactoryAuth.sol";
import "./ModuleStorage.sol";
import "./ModuleTimeLock.sol";
import "./Implementation.sol";
import "../../utils/SignatureValidator.sol";
import "../../Wallet.sol";
import "../../interfaces/IModuleAuth.sol";

contract ModuleAuth is
    IModuleAuth,
    SignatureValidator,
    Implementation,
    ModuleTimeLock,
    ModuleFactoryAuth
{
    using LibBytes for bytes;

    error InvalidSignatureType(SigType);

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

    event KeysetHashUpdated(bytes32 newKeysetHash);

    constructor(address _factory) ModuleFactoryAuth(_factory) ModuleTimeLock() {
        INIT_CODE_HASH = keccak256(
            abi.encodePacked(
                Wallet.creationCode,
                uint256(uint160(address(this)))
            )
        );
    }

    function init(IDkimKeys _dkimKeys, bytes32 _keysetHash)
        external
        payable
        onlyFactory
    {
        require(_keysetHash != bytes32(0), "ModuleAuth#init: ZERO_KEYSET");
        bytes32 salt = keccak256(abi.encodePacked(_keysetHash, _dkimKeys));
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
        ModuleStorage.writeBytes32(KEY_SET_KEY, _keysetHash);
        dkimKeys = _dkimKeys;
    }

    /**
     * @notice Updates the signers configuration of the wallet
     * @param _keysetHash New required image hash of the signature
     * @dev It is recommended to not have more than 200 signers as opcode repricing
     *      could make transactions impossible to execute as all the signers must be
     *      passed for each transaction.
     */
    function updateKeysetHash(bytes32 _keysetHash) internal {
        require(
            _keysetHash != bytes32(0),
            "ModuleAuth#updateKeysetHash INVALID_KEYSET"
        );
        ModuleStorage.writeBytes32(KEY_SET_KEY, _keysetHash);
        emit KeysetHashUpdated(_keysetHash);
    }

    function getKeysetHash() external view returns (bytes32 keysetHash) {
        keysetHash = ModuleStorage.readBytes32(KEY_SET_KEY);
    }

    function recoverySigner(bytes32 _hash, bytes calldata _signature)
        external
        pure
        returns (address)
    {
        return super.recoverSigner(_hash, _signature);
    }

    function getMetaNonce() public view returns (uint256) {
        uint256 metaNonce = uint256(ModuleStorage.readBytes32(META_NONCE_KEY));
        return metaNonce;
    }

    function _writeMetaNonce(uint256 _nonce) private {
        ModuleStorage.writeBytes32(META_NONCE_KEY, bytes32(_nonce));
    }

    function _isValidNonce(uint32 _nonce) internal view returns (bool succ) {
        uint256 metaNonce = uint256(ModuleStorage.readBytes32(META_NONCE_KEY));
        succ = _nonce > metaNonce;
    }

    function _checkPendNewKeysetHash(bytes32 _newKeysetHash) private {
        if (delay == 0) {
            updateKeysetHash(_newKeysetHash);
        } else {
            _pendNewKeysetHash(_newKeysetHash);
        }
    }

    function executeAccountTx(bytes calldata _input) public override {
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
                updateKeysetHash(newKeysetHash);
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
        }
    }

    function _isValidKeysetHash(bytes32 _keysetHash)
        internal
        view
        returns (bool)
    {
        return
            _keysetHash != bytes32(0) &&
            ModuleStorage.readBytes32(KEY_SET_KEY) == _keysetHash;
    }

    function isValidSignature(
        SigType _sigType,
        bytes32 _hash,
        bytes calldata _signature,
        uint256 _index
    ) public view override returns (bool success) {
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

    function _validateSigMasterKey(
        bytes32 _digestHash,
        bytes calldata _signature,
        uint256 _index
    ) internal view returns (bytes32 keysetHash) {
        bytes memory sig;
        (sig, _index) = _signature.readBytes66(_index);
        address masterKey = this.recoverySigner(_digestHash, sig);
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
        bytes memory sig;
        (sig, _index) = _signature.readBytes66(_index);
        address masterKey = this.recoverySigner(_digestHash, sig);
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
        bytes memory sessionKeySig;
        (sessionKeySig, _index) = _signature.readBytes66(_index);
        address recoverySessionKey = this.recoverySigner(_hash, sessionKeySig);
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
