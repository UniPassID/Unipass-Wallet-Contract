// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

abstract contract ModuleAdminAuth {
    address public admin;

    event SetAdmin(address oldAdmin, address newAdmin);

    constructor(address _admin) {
        admin = _admin;
    }

    modifier onlyAdmin() {
        require(
            msg.sender == admin,
            "ModuleAdminAuth#onlyAdmin: NOT_AUTHORIZED"
        );
        _;
    }

    function setAdmin(address _newAdmin) external onlyAdmin {
        emit SetAdmin(admin, _newAdmin);
        admin = _newAdmin;
    }
}
