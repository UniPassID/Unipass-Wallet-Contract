// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "../../interfaces/IDkimKeys.sol";

import "hardhat/console.sol";

library LibDkimAuth {
    error DkimFailed(bytes reason);

    function _dkimVerify(
        IDkimKeys _dkimKeys,
        bytes32 _pepper,
        bytes calldata _data,
        uint256 _index
    )
        internal
        view
        returns (
            bool,
            IDkimKeys.EmailType,
            bytes32,
            bytes memory,
            uint256
        )
    {
        try _dkimKeys.dkimVerify(_pepper, _index, _data) returns (
            bool ret,
            IDkimKeys.EmailType emailType,
            bytes32 emailHash,
            bytes memory sigHashHex,
            uint256 index
        ) {
            return (ret, emailType, emailHash, sigHashHex, index);
        } catch (bytes memory reason) {
            revert DkimFailed(reason);
        }
    }
}
