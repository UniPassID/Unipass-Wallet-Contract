// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "../modules/commons/ModuleCall.sol";
import "../modules/commons/ModuleAuth.sol";
import "../modules/commons/ModuleHooks.sol";

contract ModuleMain is ModuleCall, ModuleAuth, ModuleHooks {
    constructor(address _factory) ModuleAuth(_factory) {}
}
