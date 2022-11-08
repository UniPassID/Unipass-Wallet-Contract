// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "../../interfaces/IDkimKeys.sol";

import "hardhat/console.sol";

library LibDkimAuth {
    error DkimFailed(bytes reason);

    function _dkimVerify(
        IDkimKeys _dkimKeys,
        uint256 _index,
        bytes calldata _data
    )
        internal
        view
        returns (
            bool,
            IDkimKeys.EmailType,
            bytes32,
            bytes32,
            uint256
        )
    {
        try _dkimKeys.dkimVerify(0, _data[_index:]) returns (
            bool ret,
            IDkimKeys.EmailType emailType,
            bytes32 emailHash,
            bytes32 sigHashHex,
            uint256 index
        ) {
            index += _index;
            return (ret, emailType, emailHash, sigHashHex, index);
        } catch (bytes memory reason) {
            revert DkimFailed(reason);
        }
    }
}
