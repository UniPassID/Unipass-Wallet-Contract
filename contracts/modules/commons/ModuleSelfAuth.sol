// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

contract ModuleSelfAuth {
    modifier onlySelf() {
        require(msg.sender == address(this), "onlySelf: NOT_AUTHORIZED");
        _;
    }
}
