// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;
import "hardhat/console.sol";

/* solhint-disable no-inline-assembly */

abstract contract ModuleTimeLock {
    bytes32 public lockedKeysetHash;
    bool public isLocked;
    uint256 public unLockAfter;
    uint256 public constant INIT_LOCK_DURING = 1800;

    /**
     * lockDuring:
     *      0           Uninitialized Value, Like NULL Or None
     *      1 .. Max    Real LockDuring + 1, Real LockDuring = LockDuring - 1
     */
    uint256 private lockDuring;

    constructor() {}

    function getLockDuring() public view returns (uint256) {
        if (lockDuring == 0) {
            return INIT_LOCK_DURING;
        } else {
            return lockDuring - 1;
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
        require(block.timestamp > unLockAfter, "_requireToUnLock: UNLOCK_AFTER");
    }

    function _lockKeysetHash(bytes32 _toLockKeysetHash) internal {
        lockedKeysetHash = _toLockKeysetHash;
        unLockAfter = block.timestamp + getLockDuring();
        isLocked = true;
    }

    function _unlockKeysetHash() internal {
        isLocked = false;
    }

    function _setLockDuring(uint256 _lockDuring) internal {
        lockDuring = _lockDuring + 1;
    }

    function _setUnLock() internal {
        isLocked = false;
    }

    function getPendingStatus()
        external
        view
        returns (
            bool _isLocked,
            bytes32 _lockedKeysetHash,
            uint256 _unLockAfter
        )
    {
        _isLocked = isLocked;
        _lockedKeysetHash = lockedKeysetHash;
        _unLockAfter = unLockAfter;
    }
}
