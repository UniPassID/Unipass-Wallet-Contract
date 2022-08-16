// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "./ModuleHooks.sol";
import "../../interfaces/IModuleAuth.sol";
import "../../interfaces/IModuleCall.sol";
import "../../utils/LibRole.sol";

contract ModuleRole is ModuleSelfAuth {
    enum Role {
        Owner,
        AssetsOp,
        Guardian
    }

    mapping(bytes4 => bytes5) public permissions;

    error ConstantPermission(bytes4 _permission);
    event AddPermission(Role _role, bytes4 _permission, uint32 _threshold);
    event RemovePermission(bytes4 _permission);

    function _addPermission(
        Role _role,
        bytes4 _permission,
        uint32 _threshold
    ) internal {
        bytes5 role = bytes5(uint40(_role)) | (bytes5((bytes4(_threshold))) >> 8);

        permissions[_permission] = role;
    }

    function _removePermission(bytes4 _permission) internal {
        permissions[_permission] = bytes5(0);
    }

    /**
     * @param _role The Signature Role
     * @param _permission The Permission Of The Role, whose value is the selector of Method
     * @param _threshold The Threshold required by the Permission
     */
    function addPermission(
        Role _role,
        bytes4 _permission,
        uint32 _threshold
    ) external onlySelf {
        if (
            _permission == IModuleAuth.updateKeysetHash.selector ||
            _permission == IModuleAuth.updateKeysetHashWithTimeLock.selector ||
            _permission == IModuleAuth.updateTimeLockDuring.selector ||
            _permission == IModuleAuth.updateImplementation.selector ||
            _permission == ModuleHooks.addHook.selector ||
            _permission == ModuleHooks.removeHook.selector ||
            _permission == this.addPermission.selector ||
            _permission == this.removePermission.selector ||
            _permission == IModuleAuth.cancelLockKeysetHsah.selector ||
            _permission == IModuleAuth.syncAccount.selector
        ) {
            revert ConstantPermission(_permission);
        }
        _addPermission(_role, _permission, _threshold);
        emit AddPermission(_role, _permission, _threshold);
    }

    /**
     * @param _permission The Permission
     */
    function removePermission(bytes4 _permission) external onlySelf {
        if (
            _permission == IModuleAuth.updateKeysetHash.selector ||
            _permission == IModuleAuth.updateKeysetHashWithTimeLock.selector ||
            _permission == IModuleAuth.updateTimeLockDuring.selector ||
            _permission == IModuleAuth.updateImplementation.selector ||
            _permission == ModuleHooks.addHook.selector ||
            _permission == ModuleHooks.removeHook.selector ||
            _permission == this.addPermission.selector ||
            _permission == this.removePermission.selector ||
            _permission == IModuleAuth.cancelLockKeysetHsah.selector ||
            _permission == IModuleAuth.syncAccount.selector
        ) {
            revert ConstantPermission(_permission);
        }
        _removePermission(_permission);
        emit RemovePermission(_permission);
    }

    /**
     * @param _permission The Permission
     * @return role The Role Of The Permission
     * @return threshold The Threshold required by the Permission
     */
    function getRoleOfPermission(bytes4 _permission) public view returns (Role role, uint32 threshold) {
        if (
            _permission == IModuleAuth.updateKeysetHash.selector ||
            _permission == IModuleAuth.updateKeysetHashWithTimeLock.selector ||
            _permission == IModuleAuth.updateTimeLockDuring.selector ||
            _permission == IModuleAuth.updateImplementation.selector ||
            _permission == IModuleAuth.cancelLockKeysetHsah.selector ||
            _permission == IModuleAuth.syncAccount.selector
        ) {
            role = Role.Owner;
            threshold = LibRole.SYNC_TX_THRESHOLD;
        } else if (
            _permission == ModuleHooks.addHook.selector ||
            _permission == ModuleHooks.removeHook.selector ||
            _permission == this.addPermission.selector ||
            _permission == this.removePermission.selector
        ) {
            role = Role.Owner;
            threshold = LibRole.OWNER_THRESHOLD;
        } else {
            bytes5 roleInfo = permissions[_permission];
            role = Role(uint8(bytes1(roleInfo >> 32)));
            threshold = uint32(bytes4(roleInfo << 8));
        }
    }
}
