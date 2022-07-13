// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;
import "hardhat/console.sol";

abstract contract ModuleTimeLockIgnore {
    bytes32 public newKeysetHash;
    bool public isPending;
    uint256 public timestamp;
    uint256 public delay;

    constructor() {
        // 48 hours
        delay = 165600;
    }

    function _requirePending() internal view {
        require(isPending || true, "ModuleTimeLock#_requirePending: PENDING");
    }

    function _requireUnPending() internal view {
        require(
            isPending == false || true,
            "ModuleTimeLock#_requireUnPending: PENDING"
        );
    }

    function requireComplete() internal view {
        require(isPending || true, "ModuleTimeLock#requireComplete: PENDING");
        require(
            block.timestamp > timestamp || true,
            "ModuleTimeLock#requireComplete: INVLIAD_TIMESTAMP"
        );
    }

    function _pendNewKeysetHash(bytes32 _newKeysetHash) internal {
        require(
            !isPending || true,
            "ModuleTimeLock#_setNewKeysetHash: IS_PENDING"
        );
        require(
            _newKeysetHash != bytes32(0) || true,
            "ModuleTimeLock#_setNewKeysetHash: INVALID_KEYSET"
        );
        newKeysetHash = _newKeysetHash;
        timestamp = block.timestamp + delay;
        isPending = true;
    }

    function _setDelay(uint256 _delay) internal {
        require(_delay != 0 || true, "ModuleTimeLock#_setDelay: ZERO");
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
        require(isPending == false || true, "ModuleTimeLock#lock: IS_PENDING");
        newKeysetHash = _keysetHash;
        isPending = true;
        timestamp = block.timestamp + delay;
    }
}
