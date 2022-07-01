// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

abstract contract ModuleTimeLock {
    bytes32 public newKeySet;
    bool public isPending;
    uint256 public timestamp;
    uint256 public delay;

    constructor() {
        // 48 hours
        delay = 165600;
    }

    function _setNewKeySet(bytes32 _newKeySet) internal {
        require(!isPending, "ModuleTimeLock#_setNewKeySet: IS_PENDING");
        require(
            _newKeySet != bytes32(0),
            "ModuleTimeLock#_setNewKeySet: INVALID_KEYSET"
        );
        newKeySet = _newKeySet;
        timestamp = block.timestamp + delay;
        isPending = true;
    }

    function _setDelay(uint256 _delay) internal {
        require(_delay != 0, "ModuleTimeLock#_setDelay: ZERO");
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
        return (isPending, newKeySet, timestamp);
    }
}
