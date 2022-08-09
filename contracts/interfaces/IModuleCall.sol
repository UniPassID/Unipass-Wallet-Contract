// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "./ITransaction.sol";

interface IModuleCall {
    function isValidCallData(
        bytes calldata _callData,
        bytes32 _digestHash,
        bytes calldata _signature
    ) external view returns (bool success);

    event TxExecuted(bytes32 txHash);

    error TxFailed(bytes32, bytes);
}
