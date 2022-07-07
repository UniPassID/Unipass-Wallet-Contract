// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "../modules/commons/ModuleCall.sol";
import "../modules/commons/ModuleAuth.sol";

contract ModuleMain is ModuleCall, ModuleAuth {
    constructor(address _factory) ModuleAuth(_factory) {}

    // FIXME: Removing If Adding ModuleHook
    receive() external payable {}
}
