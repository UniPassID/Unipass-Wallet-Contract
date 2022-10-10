// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "./ModuleStorage.sol";
import "./ModuleSelfAuth.sol";
import "./ModuleTimeLock.sol";
import "./Implementation.sol";
import "./ModuleAuth.sol";

import "../utils/LibUnipassSig.sol";
import "../../interfaces/IModuleAccount.sol";

import "@openzeppelin/contracts/utils/Address.sol";

abstract contract ModuleAccount is IModuleAccount, ModuleSelfAuth, ModuleAuthBase, ModuleTimeLock, Implementation {
    using Address for address;

    //                       META_NONCE_KEY = keccak256("unipass-wallet:module-auth:meta-nonce")
    bytes32 private constant META_NONCE_KEY = bytes32(0x0ca6870aa26ec991ce7fe5a2fe6d18a240f46fa28d3c662b0a534d670d38ad09);

    uint256 private constant UPDATE_KEYSET_HASH = 0;
    uint256 private constant UNLOCK_KEYSET_HASH = 1;
    uint256 private constant CANCEL_LOCK_KEYSET_HASH = 2;
    uint256 private constant UPDATE_TIMELOCK_DURING = 3;
    uint256 private constant UPDATE_IMPLEMENTATION = 4;
    uint256 private constant SYNC_ACCOUNT = 6;
    uint256 private constant ZERO_CHAINID = 0;

    event UpdateKeysetHash(uint256 _metaNonce, bytes32 newKeysetHash);
    event UpdateKeysetHashWithTimeLock(uint256 _metaNonce, bytes32 newKeysetHash);
    event UnlockKeysetHash(uint256 _metaNonce);
    event CancelLockKeysetHash(uint256 _metaNonce);
    event UpdateTimeLockDuring(uint256 _metaNonce, uint32 _newTimeLockDuring);
    event UpdateImplementation(uint256 _metaNonce, address _newImplementation);
    event SyncAccount(uint256 _metaNonce, bytes32 _newKeysetHash, uint32 _newTimeLockDuring, address newImplementation);

    error InvalidActionType(uint256 _actionType);
    error InvalidImplementation(address _implementation);

    constructor() ModuleTimeLock() {}

    function _writeMetaNonce(uint256 _nonce) private {
        ModuleStorage.writeBytes32(META_NONCE_KEY, bytes32(_nonce));
    }

    function getMetaNonce() public view returns (uint256) {
        uint256 metaNonce = uint256(ModuleStorage.readBytes32(META_NONCE_KEY));
        return metaNonce;
    }

    function _validateMetaNonce(uint32 _metaNonce) internal view virtual {
        require(_metaNonce == getMetaNonce() + 1, "_validateMetaNonce: INVALID_METANONCE");
    }

    function _validateMetaNonceForSyncAccount(uint32 _metaNonce) internal view virtual {
        uint256 metaNonce = getMetaNonce();
        require(metaNonce < _metaNonce && metaNonce + 100 > _metaNonce, "_validateMetaNonceForSyncAccount: INVALID_METANONCE");
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
        _validateMetaNonceForSyncAccount(_metaNonce);
        _requireUnLocked();

        bytes32 digestHash = LibUnipassSig._subDigest(
            keccak256(abi.encodePacked(uint8(SYNC_ACCOUNT), _metaNonce, _keysetHash, _newTimeLockDuring, _newImplementation)),
            ZERO_CHAINID
        );

        (bool success, IDkimKeys.EmailType emailType, uint32 ownerWeight, , ) = validateSignature(digestHash, _signature);
        require(
            success && (emailType == IDkimKeys.EmailType.SyncAccount || emailType == IDkimKeys.EmailType.None),
            "syncAccount: INVALID_SIG"
        );

        require(ownerWeight >= LibRole.OWNER_THRESHOLD, "syncAccount: INVALID_WEIGHT");

        if (getImplementation() != _newImplementation) {
            _setImplementation(_newImplementation);
        }
        _updateKeysetHash(_keysetHash);
        if (_getLockDuring() != _newTimeLockDuring) {
            _setLockDuring(_newTimeLockDuring);
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
        _validateMetaNonce(_metaNonce);
        _requireUnLocked();
        bytes32 digestHash = LibUnipassSig._subDigest(
            keccak256(abi.encodePacked(uint8(UPDATE_KEYSET_HASH), _metaNonce, _newKeysetHash)),
            ZERO_CHAINID
        );

        (bool success, IDkimKeys.EmailType emailType, uint32 ownerWeight, , uint32 guardianWeight) = validateSignature(
            digestHash,
            _signature
        );
        require(success, "updateKeysetHash: INVALID_SIG");

        require(
            (emailType == IDkimKeys.EmailType.UpdateKeysetHash && ownerWeight >= LibRole.OWNER_THRESHOLD) ||
                (emailType == IDkimKeys.EmailType.LockKeysetHash && guardianWeight >= LibRole.GUARDIAN_THRESHOLD) ||
                (emailType == IDkimKeys.EmailType.None &&
                    (ownerWeight >= LibRole.OWNER_THRESHOLD || guardianWeight >= LibRole.GUARDIAN_THRESHOLD)),
            "updateKeysetHash: INVALID_WEIGHT"
        );

        _updateKeysetHash(_newKeysetHash);
        _writeMetaNonce(_metaNonce);
        emit UpdateKeysetHash(_metaNonce, _newKeysetHash);
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
     * @param _newKeysetHash New KeysetHash
     * @param _signature The internal signature of Accont layer transction
     */
    function updateKeysetHashWithTimeLock(
        uint32 _metaNonce,
        bytes32 _newKeysetHash,
        bytes calldata _signature
    ) external onlySelf {
        _validateMetaNonce(_metaNonce);
        _requireUnLocked();
        bytes32 digestHash = LibUnipassSig._subDigest(
            keccak256(abi.encodePacked(uint8(UPDATE_KEYSET_HASH), _metaNonce, _newKeysetHash)),
            ZERO_CHAINID
        );

        (bool success, IDkimKeys.EmailType emailType, , , uint32 guardianWeight) = validateSignature(digestHash, _signature);
        require(
            success && (emailType == IDkimKeys.EmailType.LockKeysetHash || emailType == IDkimKeys.EmailType.None),
            "updateKeysetHashWithTimeLock: INVALID_SIG"
        );

        require(guardianWeight >= LibRole.GUARDIAN_TIMELOCK_THRESHOLD, "updateKeysetHashWithTimeLock: INVALID_WEIGHT");

        _toLockKeysetHash(_newKeysetHash, _getLockDuring());
        _writeMetaNonce(_metaNonce);

        emit UpdateKeysetHashWithTimeLock(_metaNonce, _newKeysetHash);
    }

    /**
     * @param _metaNonce The Account layer transaction Signature Nonce
     */
    function unlockKeysetHash(uint32 _metaNonce) external override {
        _validateMetaNonce(_metaNonce);
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
    function cancelLockKeysetHash(uint32 _metaNonce, bytes calldata _signature) external onlySelf {
        _validateMetaNonce(_metaNonce);
        _requireLocked();
        bytes32 digestHash = LibUnipassSig._subDigest(
            keccak256(abi.encodePacked(uint8(CANCEL_LOCK_KEYSET_HASH), _metaNonce)),
            ZERO_CHAINID
        );

        (bool success, IDkimKeys.EmailType emailType, uint32 ownerWeight, , ) = validateSignature(digestHash, _signature);
        require(
            success && (emailType == IDkimKeys.EmailType.CancelLockKeysetHash || emailType == IDkimKeys.EmailType.None),
            "cancelLockKeysetHash: INVALID_SIG"
        );

        require(ownerWeight >= LibRole.OWNER_CANCEL_TIMELOCK_THRESHOLD, "cancelLockKeysetHash: INVALID_WEIGHT");

        _unlockKeysetHash();
        _writeMetaNonce(_metaNonce);

        emit CancelLockKeysetHash(_metaNonce);
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
        _validateMetaNonce(_metaNonce);
        _requireUnLocked();

        bytes32 digestHash = LibUnipassSig._subDigest(
            keccak256(abi.encodePacked(uint8(UPDATE_TIMELOCK_DURING), _metaNonce, _newTimeLockDuring)),
            ZERO_CHAINID
        );

        (bool success, IDkimKeys.EmailType emailType, uint32 ownerWeight, , ) = validateSignature(digestHash, _signature);
        require(
            success && (emailType == IDkimKeys.EmailType.UpdateTimeLockDuring || emailType == IDkimKeys.EmailType.None),
            "updateTimeLockDuring: INVALID_SIG"
        );

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
        _validateMetaNonce(_metaNonce);
        _requireUnLocked();
        if (!_newImplementation.isContract()) revert InvalidImplementation(_newImplementation);

        bytes32 digestHash = LibUnipassSig._subDigest(
            keccak256(abi.encodePacked(uint8(UPDATE_IMPLEMENTATION), _metaNonce, _newImplementation)),
            ZERO_CHAINID
        );

        (bool success, IDkimKeys.EmailType emailType, uint32 ownerWeight, , ) = validateSignature(digestHash, _signature);
        require(
            success && (emailType == IDkimKeys.EmailType.UpdateImplementation || emailType == IDkimKeys.EmailType.None),
            "updateImplementation: INVALID_SIG"
        );

        require(ownerWeight >= LibRole.OWNER_THRESHOLD, "updateImplementation: INVALID_WEIGHT");
        _setImplementation(_newImplementation);
        _writeMetaNonce(_metaNonce);

        emit UpdateImplementation(_metaNonce, _newImplementation);
    }
}
