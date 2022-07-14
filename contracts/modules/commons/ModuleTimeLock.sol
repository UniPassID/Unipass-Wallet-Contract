// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

abstract contract ModuleTimeLock {
    bytes32 public newKeysetHash;
    bool public isPending;
    uint256 public timestamp;
    uint256 public delay;

    constructor() {
        // 48 hours
        delay = 0;
    }

    function _requirePending() internal view {
        require(isPending, "ModuleTimeLock#_requirePending: PENDING");
    }

    function _requireUnPending() internal view {
        require(
            isPending == false,
            "ModuleTimeLock#_requireUnPending: PENDING"
        );
    }

    function requireComplete() internal view {
        require(isPending, "ModuleTimeLock#requireComplete: PENDING");
        require(
            block.timestamp > timestamp,
            "ModuleTimeLock#requireComplete: INVLIAD_TIMESTAMP"
        );
    }

    function _pendNewKeysetHash(bytes32 _newKeysetHash) internal {
        require(!isPending, "ModuleTimeLock#_setNewKeysetHash: IS_PENDING");
        require(
            _newKeysetHash != bytes32(0),
            "ModuleTimeLock#_setNewKeysetHash: INVALID_KEYSET"
        );
        newKeysetHash = _newKeysetHash;
        timestamp = block.timestamp + delay;
        isPending = true;
    }

    function _setDelay(uint256 _delay) internal {
        delay = _delay;
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
        return (isPending, newKeysetHash, timestamp);
    }

    function lock(bytes32 _keysetHash) external {
        require(isPending == false, "ModuleTimeLock#lock: IS_PENDING");
        newKeysetHash = _keysetHash;
        isPending = true;
        timestamp = block.timestamp + delay;
    }
}
