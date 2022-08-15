// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "../modules/commons/ModuleRole.sol";

interface IModuleAuth {
    function validateSignature(bytes32 _hash, bytes calldata _signature)
        external
        view
        returns (bool succ, RoleWeight memory roleWeightRet);

    function syncAccount(
        uint32 _metaNonce,
        bytes32 _keysetHash,
        uint32 _newTimeLockDuring,
        bytes calldata _signature
    ) external;

    function updateKeysetHash(
        uint32 _metaNonce,
        bytes32 _newKeysetHash,
        bytes calldata _signature
    ) external;

    function updateKeysetHashWithTimeLock(
        uint32 _metaNonce,
        bytes32 _newKeysetHash,
        bytes calldata _signature
    ) external;

    function unlockKeysetHash(uint256 _metaNonce) external;

    function cancelLockKeysetHsah(uint32 _metaNonce, bytes calldata _signature) external;

    function updateTimeLockDuring(
        uint32 _metaNonce,
        uint32 _newTimeLockDuring,
        bytes calldata _signature
    ) external;

    function updateImplementation(
        uint32 _metaNonce,
        address _newImplementation,
        bytes calldata _signature
    ) external;
}
