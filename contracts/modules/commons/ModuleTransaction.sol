// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/interfaces/IERC20.sol";

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
        Call,
        DelegateCall
    }

    error InvalidCallType(CallType);
    error TxFailed(bytes32 _txHash, bytes _reason);

    event TxExecuted(bytes32 _txHash);
    event TxFailedEvent(bytes32 _txHash, bytes _reason);
    event TxPayFeeFailed(bytes32 _txHash, bytes _reason);

    function _revertBytes(
        Transaction calldata _tx,
        bytes32 _txHash,
        bytes memory _reason
    ) internal {
        if (_tx.revertOnError) {
            revert TxFailed(_txHash, _reason);
        } else {
            emit TxFailedEvent(_txHash, _reason);
        }
    }
}
