// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

abstract contract ModuleTransaction {
    struct Transaction {
        CallType callType;
        bool revertOnError;
        address target;
        uint256 gasLimit;
        uint256 value;
        bytes data;
    }

    enum CallType {
        Call
    }

    error InvalidCallType(CallType);
    error TxFailed(bytes32 _txHash, uint256 _index, bytes _reason);
    error NotEnoughGas(uint256 _index, uint256 _requested, uint256 _available);

    event NotEnoughGasEvent(bytes32 _txHash, uint256 _index, uint256 _requested, uint256 _available);
    event TxExecuted(bytes32 _txHash, uint256 _index);
    event TxFailedEvent(bytes32 _txHash, uint256 _index, bytes _reason);
    event TxPayFeeFailed(bytes32 _txHash, uint256 _index, bytes _reason);

    function _revertBytes(bool _revertOnError, bytes32 _txHash, uint256 _index, bytes memory _reason) internal {
        if (_revertOnError) {
            revert TxFailed(_txHash, _index, _reason);
        } else {
            emit TxFailedEvent(_txHash, _index, _reason);
        }
    }
}
