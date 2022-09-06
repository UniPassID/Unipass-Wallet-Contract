// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "../../interfaces/IDkimKeys.sol";

import "hardhat/console.sol";

library LibDkimAuth {
    error DkimFailed(bytes reason);

    function _dkimVerify(
        IDkimKeys _dkimKeys,
        bytes calldata _data,
        uint256 _index,
        bytes32 _pepper
    )
        internal
        view
        returns (
            bool,
            bytes32,
            bytes memory,
            uint256
        )
    {
        try _dkimKeys.dkimVerify(_data, _index, _pepper) returns (
            bool ret,
            bytes32 emailHash,
            bytes memory sigHashHex,
            uint256 index
        ) {
            return (ret, emailHash, sigHashHex, index);
        } catch (bytes memory reason) {
            revert DkimFailed(reason);
        }
    }
}
