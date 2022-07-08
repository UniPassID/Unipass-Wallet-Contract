// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "../interfaces/IDkimKeys.sol";

import "../modules/commons/ModuleHooks.sol";

contract TestModuleHooks is ModuleHooks {
    function executeHooksTx(bytes calldata _input) external {
        _executeHooksTx(_input);
    }
}
