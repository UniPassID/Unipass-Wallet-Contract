// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.15;

import "../modules/utils/LibEmailHash.sol";
import "../interfaces/IModuleAccount.sol";

interface IOpenID {
    function validateIDToken(uint256 _index, bytes calldata _data)
        external
        view
        returns (
            bool succ,
            uint256 index,
            bytes32 issHash,
            bytes32 subHash,
            bytes32 nonceHash
        );
}
