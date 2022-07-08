// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

abstract contract IModuleHooks {
    // Errors
    error HookAlreadyExists(bytes4 _signature);
    error HookDoesNotExist(bytes4 _signature);

    function _executeHooksTx(bytes calldata _input) internal virtual;
}
