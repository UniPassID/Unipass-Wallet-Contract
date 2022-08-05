// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

interface IModuleAuth {
    function validateSignatureWeight(
        uint256 _expectedSigWeight,
        bytes32 _hash,
        bytes calldata _signature
    ) external view returns (bool success, uint256 sigWeight);
}
