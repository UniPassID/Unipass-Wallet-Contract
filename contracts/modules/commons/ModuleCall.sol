// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./ModuleStorage.sol";
import "../../utils/LibBytes.sol";
import "../../interfaces/IModuleAuth.sol";

abstract contract ModuleCall is IModuleAuth {
    using LibBytes for bytes;
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
        CallAccountLayer
    }

    error txFailed(Transaction, bytes32, bytes);

    event TxExecuted(bytes32);

    // NONCE_KEY = kecaak256("unipass-wallet:module-call:nonce");
    bytes32 private constant NONCE_KEY =
        bytes32(
            0x93ed8d86f5d7fd79ac84d87731132a08aec6fc45dd823a5af26bb3e79833c46b
        );

    uint256 private constant SIG_MASTER_KEY = 0;
    uint256 private constant SIG_SESSION_KEY = 3;
    uint256 private constant SIG_NONE = 4;

    function getNonce() public view returns (uint256) {
        return uint256(ModuleStorage.readBytes32Map(NONCE_KEY, bytes32(0)));
    }

    function _writeNonce(uint256 _nonce) private {
        ModuleStorage.writeBytes32(NONCE_KEY, bytes32(_nonce));
    }

    function execute(
        Transaction[] calldata _txs,
        uint256 _nonce,
        address feeToken,
        address feeReceiver,
        uint256 feeAmount,
        bytes calldata _signature
    ) external payable {
        _validateNonce(_nonce);

        uint256 chainId;
        assembly {
            chainId := chainid()
        }

        bytes32 txhash = keccak256(
            abi.encodePacked(
                chainId,
                keccak256(abi.encode(_nonce, _txs)),
                feeToken,
                feeReceiver,
                feeAmount
            )
        );

        uint8 _sigType;
        uint256 index;
        (_sigType, index) = _signature.readFirstUint8();
        SigType sigType = SigType(_sigType);
        require(
            sigType == SigType.SigMasterKey ||
                sigType == SigType.SigSessionKey ||
                sigType == SigType.SigNone,
            "ModuleCall#execute: INVALID_SIG_TYPE"
        );
        require(
            _isValidSignature(sigType, txhash, _signature, index),
            "ModuleCall#execute: INVALID_SIGNATURE"
        );

        _execute(txhash, _txs, _sigType);
        if (feeAmount != 0) {
            _payFee(feeToken, feeReceiver, feeAmount);
        }
    }

    function _validateNonce(uint256 _nonce) internal {
        uint256 currentNonce = getNonce();
        require(
            _nonce == currentNonce + 1,
            "ModuleCall#_validateNonce: INVALID_NONCE"
        );
        _writeNonce(_nonce);
    }

    function _execute(
        bytes32 _txHash,
        Transaction[] calldata _txs,
        uint256 _sigType
    ) internal {
        for (uint256 i = 0; i < _txs.length; i++) {
            Transaction calldata transaction = _txs[i];

            require(
                gasleft() >= transaction.gasLimit,
                "ModuleCall#_execute: NOT_ENOUGH_GAS"
            );

            bool success;
            bytes memory result;

            if (transaction.callType == CallType.Call) {
                require(
                    _sigType != SIG_NONE,
                    "ModuleCall#_execute: INVALID_Call_TYPE"
                );
                (success, result) = transaction.target.call{
                    value: transaction.value,
                    gas: transaction.gasLimit == 0
                        ? gasleft()
                        : transaction.gasLimit
                }(transaction.data);
            } else if (transaction.callType == CallType.DelegateCall) {
                require(
                    _sigType != SIG_NONE,
                    "ModuleCall#_execute: INVALID_Call_TYPE"
                );
                (success, result) = transaction.target.delegatecall{
                    gas: transaction.gasLimit == 0
                        ? gasleft()
                        : transaction.gasLimit
                }(transaction.data);
            } else if (transaction.callType == CallType.CallAccountLayer) {
                _executeInner(transaction.data);
                success = true;
            }
            if (success) {
                emit TxExecuted(_txHash);
            } else {
                revert txFailed(transaction, _txHash, result);
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
