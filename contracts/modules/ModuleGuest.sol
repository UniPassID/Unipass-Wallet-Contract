// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./commons/ModuleRole.sol";
import "./commons/ModuleTransaction.sol";

contract ModuleGuest is ModuleTransaction {
    using SafeERC20 for IERC20;

    function execute(
        Transaction[] calldata _txs,
        uint256 _nonce,
        bytes calldata
    ) external payable {
        bytes32 txhash = keccak256(abi.encodePacked(block.chainid, keccak256(abi.encode(_nonce, _txs))));

        _execute(txhash, _txs);
    }

    function _execute(bytes32 _txHash, Transaction[] calldata _txs) internal {
        for (uint256 i = 0; i < _txs.length; i++) {
            Transaction calldata transaction = _txs[i];

            require(gasleft() >= transaction.gasLimit, "_execute: NOT_ENOUGH_GAS");

            bool success;
            bytes memory result;

            if (transaction.callType == CallType.Call) {
                (success, result) = transaction.target.call{
                    value: transaction.value,
                    gas: transaction.gasLimit == 0 ? gasleft() : transaction.gasLimit
                }(transaction.data);
            } else {
                revert InvalidCallType(transaction.callType);
            }
            if (success) {
                emit TxExecuted(_txHash);
            } else {
                _revertBytes(transaction, _txHash, result);
            }
        }
    }
}
