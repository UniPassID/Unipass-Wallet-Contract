// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import "../../interfaces/IOpenID.sol";

import "hardhat/console.sol";

library LibOpenIDAuth {
    error OpenIDAuthFailed(bytes reason);

    function _openIDVerify(
        IOpenID _openID,
        uint256 _index,
        bytes calldata _data
    )
        internal
        view
        returns (
            bool,
            uint256,
            bytes32,
            bytes32,
            bytes32
        )
    {
        try _openID.validateIDToken(0, _data[_index:]) returns (
            bool succ,
            uint256 index,
            bytes32 issHash,
            bytes32 subHash,
            bytes32 nonceHash
        ) {
            index += _index;
            return (succ, index, issHash, subHash, nonceHash);
        } catch (bytes memory reason) {
            revert OpenIDAuthFailed(reason);
        }
    }
}
