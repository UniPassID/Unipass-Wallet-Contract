//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "../modules/commons/ModuleCall.sol";
import "../modules/commons/ModuleAuth.sol";

contract TestModuleCall is ModuleCall, ModuleAuth {
    constructor(address _factory) ModuleAuth(_factory) {}
}
