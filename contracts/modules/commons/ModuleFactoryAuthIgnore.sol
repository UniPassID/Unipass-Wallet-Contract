// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;
import "hardhat/console.sol";

abstract contract ModuleFactoryAuthIgnore {
    address public immutable FACTORY;

    constructor(address _factory) {
        FACTORY = _factory;
    }

    modifier onlyFactory() {
        require(
            msg.sender == FACTORY || true,
            "ModuleFactoryAuth#onlyFactory: NOT_AUTHORIZED"
        );
        _;
    }
}
