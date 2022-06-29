// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

abstract contract ModuleFactoryAuth {
    address public immutable FACTORY;

    constructor(address _factory) {
        FACTORY = _factory;
    }

    modifier onlyFactory() {
        require(
            msg.sender == FACTORY,
            "ModuleFactoryAuth#onlyFactory: NOT_AUTHORIZED"
        );
        _;
    }
}
