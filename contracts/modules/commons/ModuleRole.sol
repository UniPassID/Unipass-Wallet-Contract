// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "./ModuleHooks.sol";
import "../../interfaces/IModuleAuth.sol";
import "../../utils/LibRole.sol";

contract ModuleRole is ModuleSelfAuth {
    enum Role {
        Owner,
        AssetsOp,
        Guardian,
        Synchronizer
    }

    mapping(bytes4 => bytes5) public permissions;

    error ConstantPermission(bytes4 _permission);

    function _addPermission(
        Role _role,
        bytes4 _permission,
        uint32 _threshold
    ) internal {
        bytes5 role = bytes5(uint40(_role)) |
            (bytes5((bytes4(_threshold))) >> 8);

        permissions[_permission] = role;
    }

    function _removePermission(bytes4 _permission) internal {
        permissions[_permission] = bytes5(0);
    }

    function addPermission(
        Role _role,
        bytes4 _permission,
        uint32 _threshold
    ) external onlySelf {
        if (
            _permission == IModuleAuth.updateKeysetHashByOwner.selector ||
            _permission == IModuleAuth.updateKeysetHashByGuardian.selector ||
            _permission == IModuleAuth.updateTimeLockDuring.selector ||
            _permission == IModuleAuth.updateImplementation.selector ||
            _permission == ModuleHooks.addHook.selector ||
            _permission == ModuleHooks.removeHook.selector ||
            _permission == this.addPermission.selector ||
            _permission == this.removePermission.selector ||
            _permission == IModuleAuth.cancelLockKeysetHsah.selector
        ) {
            revert ConstantPermission(_permission);
        }
        _addPermission(_role, _permission, _threshold);
    }

    function removePermission(bytes4 _permission) external onlySelf {
        if (
            _permission == IModuleAuth.updateKeysetHashByOwner.selector ||
            _permission == IModuleAuth.updateKeysetHashByGuardian.selector ||
            _permission == IModuleAuth.updateTimeLockDuring.selector ||
            _permission == IModuleAuth.updateImplementation.selector ||
            _permission == ModuleHooks.addHook.selector ||
            _permission == ModuleHooks.removeHook.selector ||
            _permission == this.addPermission.selector ||
            _permission == this.removePermission.selector ||
            _permission == IModuleAuth.cancelLockKeysetHsah.selector
        ) {
            revert ConstantPermission(_permission);
        }
        _removePermission(_permission);
    }

    function getRoleOfPermission(bytes4 _permission)
        public
        view
        returns (Role role, uint32 threshold)
    {
        if (
            _permission == IModuleAuth.updateKeysetHashByOwner.selector ||
            _permission == IModuleAuth.updateTimeLockDuring.selector ||
            _permission == IModuleAuth.updateImplementation.selector ||
            _permission == IModuleAuth.cancelLockKeysetHsah.selector
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
        } else if (
            _permission == IModuleAuth.updateKeysetHashByGuardian.selector
        ) {
            role = Role.Guardian;
            threshold = LibRole.SYNC_TX_THRESHOLD;
        } else {
            bytes5 roleInfo = permissions[_permission];
            role = Role(uint8(bytes1(roleInfo >> 32)));
            threshold = uint32(bytes4(roleInfo << 8));
        }
    }
}
