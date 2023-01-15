// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "./ModuleStorage.sol";
import "../utils/LibTimeLock.sol";

/* solhint-disable no-inline-assembly */

abstract contract ModuleTimeLock {
    //                       LOCKED_KEYSET_HASH_KEY = keccak256("unipass-wallet:module-time-lock:locked-keyset-hash")
    bytes32 private constant LOCKED_KEYSET_HASH_KEY = bytes32(0x7e037a85480f86b76d12a4370b597f2eda994cb35030d7b7485c0ce95ff55540);

    bool private isLocked;
    uint32 private unlockAfter;

    /**
     * lockDuring:
     *      0           Uninitialized Value, Like NULL Or None
     *      1 .. Max    Real LockDuring + 1, Real LockDuring = LockDuring - 1
     */
    uint32 private lockDuring;

    function _writeLockedKeysetHash(bytes32 _lockedKeysetHash) private {
        ModuleStorage.writeBytes32(LOCKED_KEYSET_HASH_KEY, _lockedKeysetHash);
    }

    function _readLockedKeysetHash() internal view returns (bytes32 lockedKeysetHash) {
        lockedKeysetHash = ModuleStorage.readBytes32(LOCKED_KEYSET_HASH_KEY);
    }

    function _getLockDuring() internal view returns (uint32 lockDuringRet) {
        if (lockDuring == 0) {
            lockDuringRet = LibTimeLock.INIT_LOCK_DURING;
        } else {
            lockDuringRet = lockDuring - 1;
        }
    }

    function _requireLocked() internal view {
        require(isLocked, "_requireLocked: UNLOCKED");
    }

    function _requireUnLocked() internal view {
        require(!isLocked, "_requireUnLocked: IS_LOCKED");
    }

    function _requireToUnLock() internal view {
        require(isLocked, "_requireToUnLock: UNLOCKED");
        require(block.timestamp > unlockAfter, "_requireToUnLock: UNLOCK_AFTER");
    }

    function _lockKeysetHash(bytes32 _toLockKeysetHash) internal {
        _writeLockedKeysetHash(_toLockKeysetHash);
        unlockAfter = uint32(block.timestamp) + _getLockDuring();
        isLocked = true;
    }

    function _unlockKeysetHash() internal {
        isLocked = false;
    }

    function _setLockDuring(uint32 _lockDuring) internal {
        lockDuring = _lockDuring + 1;
    }


    function getLockInfo()
        external
        view
        returns (bool isLockedRet, uint32 lockDuringRet, bytes32 lockedKeysetHashRet, uint256 unlockAfterRet)
    {
        isLockedRet = isLocked;
        lockDuringRet = _getLockDuring();
        if (isLockedRet) {
            lockedKeysetHashRet = _readLockedKeysetHash();
            unlockAfterRet = unlockAfter;
        }
    }
}
