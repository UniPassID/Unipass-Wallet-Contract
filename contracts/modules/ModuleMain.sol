// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "../modules/commons/ModuleCall.sol";
import "../modules/commons/ModuleAuthFixed.sol";
import "../modules/commons/ModuleHooks.sol";

contract ModuleMain is ModuleCall, ModuleAuthFixed, ModuleHooks {
    constructor(
        address _factory,
        address _moduleMainUpgradable,
        IDkimKeys _dkimKeys
    ) ModuleAuthFixed(_factory, _moduleMainUpgradable, _dkimKeys) {}
}
