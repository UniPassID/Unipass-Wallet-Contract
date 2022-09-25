// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "./ModuleAdminAuth.sol";

import "hardhat/console.sol";

contract ModuleWhiteList is ModuleAdminAuth {
    error InvalidStatus(bool _status, bool _changeStatus);

    event UpdateHookWhiteList(address _addr, bool _isWhite);
    event UpdateImplementationWhiteList(address _addr, bool _isWhite);

    mapping(address => bool) private implementations;
    mapping(address => bool) private hooks;

    constructor(address _admin) ModuleAdminAuth(_admin) {}

    function isHookWhiteList(address _hook) external view returns (bool isWhite) {
        isWhite = hooks[_hook];
    }

    /**
     * @param _addr Whilte List Address For Hooks
     * @param _isWhite Add _addr to white list or remove from white list
     */
    function updateHookWhiteList(address _addr, bool _isWhite) external onlyAdmin {
        bool isWhite = hooks[_addr];
        if (isWhite != _isWhite) {
            hooks[_addr] = _isWhite;
            emit UpdateHookWhiteList(_addr, _isWhite);
        } else {
            revert InvalidStatus(isWhite, _isWhite);
        }
    }

    function isImplementationWhiteList(address _implementation) external view returns (bool isWhite) {
        isWhite = implementations[_implementation];
    }

    /**
     * @param _addr Whilte List Address For Implementations
     * @param _isWhite Add _addr to white list or remove from white list
     */
    function updateImplementationWhiteList(address _addr, bool _isWhite) external onlyAdmin {
        bool isWhite = implementations[_addr];
        if (isWhite != _isWhite) {
            implementations[_addr] = _isWhite;
            emit UpdateImplementationWhiteList(_addr, _isWhite);
        } else {
            revert InvalidStatus(isWhite, _isWhite);
        }
    }
}
