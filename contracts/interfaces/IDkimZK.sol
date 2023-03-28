// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.15;

interface IDkimZK {
    function getEmailHashByZK(
        uint32 _fromLeftIndex,
        uint32 _fromLen,
        uint256 _index,
        bytes calldata _headerPubMatch,
        bytes calldata _data
    )
        external
        view
        returns (
            bytes32 emailHash,
            bytes32 emailHeaderHash,
            uint256 index
        );
}
