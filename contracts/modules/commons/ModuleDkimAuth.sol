// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "../../interfaces/IDkimKeys.sol";

import "hardhat/console.sol";

contract ModuleDkimAuth {
    IDkimKeys public immutable dkimKeys;

    constructor(IDkimKeys _dkimKeys) {
        require(address(_dkimKeys) != address(0), "constructor: ZERO");
        dkimKeys = _dkimKeys;
    }

    function _dkimVerify(
        bytes calldata _data,
        uint256 _index,
        bytes memory inputEmailFrom
    )
        internal
        view
        returns (
            bool ret,
            bytes32 emailHash,
            bytes memory sigHashHex,
            uint256 index
        )
    {
        (ret, emailHash, sigHashHex, index) = dkimKeys.dkimVerify(
            _data,
            _index,
            inputEmailFrom
        );
    }
}
