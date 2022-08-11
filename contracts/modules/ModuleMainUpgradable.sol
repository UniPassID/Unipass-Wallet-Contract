// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "../modules/commons/ModuleCall.sol";
import "../modules/commons/ModuleAuthUpgradable.sol";
import "../modules/commons/ModuleHooks.sol";

contract ModuleMainUpgradable is ModuleCall, ModuleAuthUpgradable, ModuleHooks {
    /**
     * @param _dkimKeys The Address Of DkimKeys, which is used for Dkim Verify
     */
    constructor(IDkimKeys _dkimKeys) ModuleAuthUpgradable(_dkimKeys) {}
}
