// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "./ModuleHooks.sol";
import "../../interfaces/IModuleAccount.sol";
import "../../utils/LibRole.sol";

contract ModuleRole is ModuleSelfAuth {
    mapping(bytes4 => bytes12) public permissions;

    error ConstantPermission(bytes4 _permission);
    event AddPermission(bytes4 _permission, uint32 _ownerWeight, uint32 _assetsOpWeight, uint32 _guardianWeight);
    event RemovePermission(bytes4 _permission);

    function _addPermission(
        bytes4 _permission,
        uint32 _ownerWeight,
        uint32 _assetsOpWeight,
        uint32 _guardianWeight
    ) internal {
        bytes12 roleWeight = (bytes12)((bytes4)(_ownerWeight)) |
            (bytes12(bytes4(_assetsOpWeight)) >> 32) |
            (bytes12(bytes4(_guardianWeight)) >> 64);

        permissions[_permission] = roleWeight;
    }

    function _removePermission(bytes4 _permission) internal {
        permissions[_permission] = bytes12(0);
    }

    /**
     * @param _permission The Permission Of The Role, whose value is the selector of Method
     * @param _ownerWeight The Threshold Weight of Role Owner
     * @param _assetsOpWeight The Threshold Weight Of Role AssetsOp
     * @param _guardianWeight The Threshold Weight Of Role Guardian
     */
    function addPermission(
        bytes4 _permission,
        uint32 _ownerWeight,
        uint32 _assetsOpWeight,
        uint32 _guardianWeight
    ) external onlySelf {
        if (
            _permission == IModuleAccount.updateKeysetHash.selector ||
            _permission == IModuleAccount.updateKeysetHashWithTimeLock.selector ||
            _permission == IModuleAccount.updateTimeLockDuring.selector ||
            _permission == IModuleAccount.updateImplementation.selector ||
            _permission == ModuleHooks.addHook.selector ||
            _permission == ModuleHooks.removeHook.selector ||
            _permission == this.addPermission.selector ||
            _permission == this.removePermission.selector ||
            _permission == IModuleAccount.cancelLockKeysetHash.selector ||
            _permission == IModuleAccount.syncAccount.selector
        ) {
            revert ConstantPermission(_permission);
        }
        _addPermission(_permission, _ownerWeight, _assetsOpWeight, _guardianWeight);
        emit AddPermission(_permission, _ownerWeight, _assetsOpWeight, _guardianWeight);
    }

    /**
     * @param _permission The Permission
     */
    function removePermission(bytes4 _permission) external onlySelf {
        if (
            _permission == IModuleAccount.updateKeysetHash.selector ||
            _permission == IModuleAccount.updateKeysetHashWithTimeLock.selector ||
            _permission == IModuleAccount.updateTimeLockDuring.selector ||
            _permission == IModuleAccount.updateImplementation.selector ||
            _permission == ModuleHooks.addHook.selector ||
            _permission == ModuleHooks.removeHook.selector ||
            _permission == this.addPermission.selector ||
            _permission == this.removePermission.selector ||
            _permission == IModuleAccount.cancelLockKeysetHash.selector ||
            _permission == IModuleAccount.syncAccount.selector
        ) {
            revert ConstantPermission(_permission);
        }
        _removePermission(_permission);
        emit RemovePermission(_permission);
    }

    /**
     * @param _permission The Permission
     * @return ownerWeight The Threshold Weight of Role Owner
     * @return assetsOpWeight The Threshold Weight Of Role AssetsOp
     * @return guardianWeight The Threshold Weight Of Role Guardian
     */
    function getRoleOfPermission(bytes4 _permission)
        public
        view
        returns (
            uint32 ownerWeight,
            uint32 assetsOpWeight,
            uint32 guardianWeight
        )
    {
        if (
            _permission == IModuleAccount.updateKeysetHash.selector ||
            _permission == IModuleAccount.updateKeysetHashWithTimeLock.selector ||
            _permission == IModuleAccount.updateTimeLockDuring.selector ||
            _permission == IModuleAccount.updateImplementation.selector ||
            _permission == IModuleAccount.cancelLockKeysetHash.selector ||
            _permission == IModuleAccount.syncAccount.selector
        ) {
            ownerWeight = LibRole.SYNC_TX_THRESHOLD;
        } else if (
            _permission == ModuleHooks.addHook.selector ||
            _permission == ModuleHooks.removeHook.selector ||
            _permission == this.addPermission.selector ||
            _permission == this.removePermission.selector
        ) {
            ownerWeight = LibRole.OWNER_THRESHOLD;
        } else {
            bytes12 roleWeight = permissions[_permission];
            ownerWeight = uint32((bytes4)(roleWeight));
            assetsOpWeight = uint32((bytes4)(roleWeight << 32));
            guardianWeight = uint32((bytes4)(roleWeight << 64));
        }
    }
}
