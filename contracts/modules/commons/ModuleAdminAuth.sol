// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.15;

import "./ModuleStorage.sol";

abstract contract ModuleAdminAuth {
    address private immutable INIT_ADMIN;
    //                       ADMIN_KEY = keccak256("unipass-wallet:module-admin-auth:admin")
    bytes32 private constant ADMIN_KEY = bytes32(0x077eec71d1e8d57dc2d7e44644508720000478419c89744f720710751f983aa3);

    event SetAdmin(address oldAdmin, address newAdmin);

    function _writeAdmin(address _admin) internal {
        ModuleStorage.writeBytes32(ADMIN_KEY, bytes32(bytes20(_admin)));
    }

    function _readAdmin() internal view returns (address admin) {
        admin = address(bytes20(ModuleStorage.readBytes32(ADMIN_KEY)));
    }

    function getAdmin() public view returns (address admin) {
        admin = _readAdmin();
        if (admin == address(0)) admin = INIT_ADMIN;
    }

    constructor(address _admin) {
        require(_admin != address(0), "ModuleAdminAuth#constructor: INVALID_ADMIN");
        INIT_ADMIN = _admin;
    }

    modifier onlyAdmin() {
        require(msg.sender == getAdmin(), "NOT_AUTHORIZED");
        _;
    }

    function setAdmin(address _newAdmin) external onlyAdmin {
        emit SetAdmin(getAdmin(), _newAdmin);
        _writeAdmin(_newAdmin);
    }
}
