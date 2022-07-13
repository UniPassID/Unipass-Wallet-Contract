// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "../modules/commons/ModuleCallIgnore.sol";
import "../modules/commons/ModuleAuthIgnore.sol";
import "../modules/commons/ModuleHooks.sol";
import "../interfaces/ITransaction.sol";

import "hardhat/console.sol";

contract ModuleMainGasEstimation is
    ModuleCallIgnore,
    ModuleAuthIgnore,
    ModuleHooks
{
    constructor(address _factory) ModuleAuthIgnore(_factory) {}
}
