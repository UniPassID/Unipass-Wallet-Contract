// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./commons/ModuleRole.sol";

contract ModuleGuest {
    using SafeERC20 for IERC20;

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

    error TxFailed(bytes32, bytes);
    error InvalidCallType(CallType);

    event TxExecuted(bytes32 txHash);

    uint256 private constant SIG_MASTER_KEY = 0;
    uint256 private constant SIG_MASTER_KEY_WITH_RECOVERY_EMAILS = 2;
    uint256 private constant SIG_SESSION_KEY = 3;
    uint256 private constant SIG_NONE = 4;

    function execute(
        Transaction[] calldata _txs,
        uint256 _nonce,
        address feeToken,
        address feeReceiver,
        uint256 feeAmount,
        bytes calldata
    ) external payable {
        uint256 chainId;
        assembly {
            chainId := chainid()
        }

        bytes32 txhash = keccak256(
            abi.encodePacked(
                abi.encodePacked(chainId, keccak256(abi.encode(_nonce, _txs))),
                feeToken,
                feeAmount
            )
        );

        _execute(txhash, _txs);
        if (feeAmount != 0) {
            _payFee(feeToken, feeReceiver, feeAmount);
        }
    }

    function _execute(bytes32 _txHash, Transaction[] calldata _txs) internal {
        for (uint256 i = 0; i < _txs.length; i++) {
            Transaction calldata transaction = _txs[i];

            require(
                gasleft() >= transaction.gasLimit,
                "_execute: NOT_ENOUGH_GAS"
            );

            bool success;
            bytes memory result;

            if (transaction.callType == CallType.Call) {
                (success, result) = transaction.target.call{
                    value: transaction.value,
                    gas: transaction.gasLimit == 0
                        ? gasleft()
                        : transaction.gasLimit
                }(transaction.data);
            } else {
                revert InvalidCallType(transaction.callType);
            }
            if (success) {
                emit TxExecuted(_txHash);
            } else {
                revert TxFailed(_txHash, result);
            }
        }
    }

    function _payFee(
        address feeToken,
        address feeReceiver,
        uint256 feeAmount
    ) private {
        // transfer native token to msg.sender
        if (feeToken == address(0))
            payable(feeReceiver).transfer(feeAmount);
            // transfer erc20 token to msg.sender
        else IERC20(feeToken).safeTransfer(feeReceiver, feeAmount);
    }
}
