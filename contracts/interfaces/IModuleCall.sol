// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

interface IModuleCall {
    function isValidCallData(
        bytes calldata _callData,
        bytes32 _digestHash,
        bytes calldata _signature
    ) external view returns (bool success);
}
