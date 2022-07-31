// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;
import "hardhat/console.sol";

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
        require(isLocked, "ModuleTimeLock#_requireLocked: UNLOCKED");
    }

    function _requireUnLocked() internal view {
        require(!isLocked, "ModuleTimeLock#_requireUnLocked: IS_LOCKED");
    }

    function _requireToUnLock() internal view {
        require(isLocked, "ModuleTimeLock#requireUnLocked: UNLOCKED");
        require(
            block.timestamp > unLockAfter,
            "ModuleTimeLock#requireUnLocked: UNLOCK_AFTER"
        );
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
            bool,
            bytes32,
            uint256
        )
    {
        return (isLocked, lockedKeysetHash, unLockAfter);
    }
}
