// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "../interfaces/IDkimKeys.sol";

import "../modules/commons/ModuleDkimAuth.sol";

contract DkimAuth is ModuleDkimAuth {
    constructor(IDkimKeys _dkimKeys) {
        dkimKeys = _dkimKeys;
    }
}
