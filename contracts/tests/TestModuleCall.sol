//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "../modules/commons/ModuleCall.sol";
import "../modules/commons/ModuleAuth.sol";
import "../modules/commons/ModuleHooks.sol";

contract TestModuleCall is ModuleCall, ModuleAuth, ModuleHooks {
    constructor(address _factory) ModuleAuth(_factory) {}
}
