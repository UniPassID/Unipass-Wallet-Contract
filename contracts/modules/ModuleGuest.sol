// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import "./commons/ModuleTransaction.sol";
import "../utils/LibOptim.sol";

contract ModuleGuest is ModuleTransaction {
    function _subDigest(bytes32 _digest, uint256 _chainId) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", _chainId, address(this), _digest));
    }

    function execute(
        Transaction[] calldata _txs,
        uint256,
        bytes calldata
    ) external payable {
        bytes32 txhash = _subDigest(keccak256(abi.encode("guest:", _txs)), block.chainid);
        _execute(txhash, _txs);
    }

    function _execute(bytes32 _txHash, Transaction[] calldata _txs) internal {
        for (uint256 i; i < _txs.length; i++) {
            Transaction calldata transaction = _txs[i];
            uint256 gasLimit = transaction.gasLimit;

            if (gasleft() < gasLimit) {
                if (transaction.revertOnError) {
                    revert NotEnoughGas(i, gasLimit, gasleft());
                } else {
                    emit NotEnoughGasEvent(_txHash, i, gasLimit, gasleft());
                    return;
                }
            }

            bool success;

            if (transaction.callType == CallType.Call) {
                success = LibOptim.call(
                    transaction.target,
                    transaction.value,
                    gasLimit == 0 ? gasleft() : gasLimit,
                    transaction.data
                );
            } else {
                revert InvalidCallType(transaction.callType);
            }
            if (success) {
                emit TxExecuted(_txHash, i);
            } else {
                _revertBytes(transaction.revertOnError, _txHash, i, LibOptim.returnData());
            }
        }
    }
}
