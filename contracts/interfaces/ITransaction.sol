// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

abstract contract ITransaction {
    struct Transaction {
        CallType callType;
        uint256 gasLimit;
        address target;
        uint256 value;
        bytes data;
    }

    enum CallType {
        Call,
        DelegateCall,
        CallAccountLayer,
        CallHooks
    }

    error txFailed(Transaction, bytes32, bytes);
    error invalidCallType(CallType);
}
