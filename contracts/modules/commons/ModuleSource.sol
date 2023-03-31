// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import "./ModuleStorage.sol";

import "hardhat/console.sol";

abstract contract ModuleSource {
    //                       SOURCE_KEY = keccak256("unipass-wallet:module-source:source")
    bytes32 private constant SOURCE_KEY = bytes32(0xdaa79580c56b4e8ad10a9ff0528bff8a0024111f67686c391e48da8ced3b8c6c);

    event SetSource(bytes32 _source);

    function _writeSource(bytes32 _source) private {
        ModuleStorage.writeBytes32(SOURCE_KEY, _source);
    }

    function setSource(bytes32 _source) external {
        require(_source != bytes32(0), "_setSource: ZERO_SOURCE");
        require(getSource() == bytes32(0), "_setSource: EXISTED_SOURCE");
        _writeSource(_source);
        emit SetSource(_source);
    }

    function getSource() public view returns (bytes32 source) {
        source = ModuleStorage.readBytes32(SOURCE_KEY);
    }
}
