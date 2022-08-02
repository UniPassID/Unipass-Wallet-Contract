//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "../modules/commons/ModuleCall.sol";
import "../modules/commons/ModuleAuthFixed.sol";
import "../modules/commons/ModuleHooks.sol";

contract TestModuleCall is ModuleCall, ModuleAuthFixed, ModuleHooks {
    constructor(
        address _factory,
        address _moduleMainUpgradable,
        IDkimKeys _dkimKeys,
        address _entryPoint
    )
        ModuleAuthFixed(_factory, _moduleMainUpgradable, _dkimKeys, _entryPoint)
    {}
}
