// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.15;

import "./IDkimKeys.sol";

interface IModuleAuth {
    function validateSignature(bytes32 _hash, bytes calldata _signature)
        external
        view
        returns (
            bool succ,
            IDkimKeys.EmailType emailType,
            uint32 ownerWeight,
            uint32 assetOpWeight,
            uint32 guardianWeight
        );
}
