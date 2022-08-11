// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "../modules/utils/LibDkim.sol";

interface IDkimKeys {
    function getDKIMKey(bytes calldata _emailServer) external view returns (bytes memory);

    function dkimVerify(
        bytes calldata _data,
        uint256 _index,
        bytes calldata _inputEmailFrom
    )
        external
        view
        returns (
            bool ret,
            bytes32 emailHash,
            bytes memory sigHashHex,
            uint256 index
        );
}
