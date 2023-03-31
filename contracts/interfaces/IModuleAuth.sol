// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

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
