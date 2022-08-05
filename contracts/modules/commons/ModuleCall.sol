// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

/* solhint-disable no-unused-vars */

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./ModuleStorage.sol";
import "./ModuleAuthBase.sol";
import "./ModuleEIP4337WalletCall.sol";
import "../../utils/LibBytes.sol";
import "../../interfaces/IModuleHooks.sol";
import "../../interfaces/ITransaction.sol";
import "../../interfaces/IEIP4337Wallet.sol";

abstract contract ModuleCall is
    ITransaction,
    ModuleAuthBase,
    IModuleHooks,
    ModuleEIP4337WalletCall
{
    using LibBytes for bytes;
    using SafeERC20 for IERC20;

    // NONCE_KEY = kecaak256("unipass-wallet:module-call:nonce");
    bytes32 private constant NONCE_KEY =
        bytes32(
            0x93ed8d86f5d7fd79ac84d87731132a08aec6fc45dd823a5af26bb3e79833c46b
        );
    // ENTRY_POINT_TX_HASH = kecaak256("unipass-wallet:module-call:entry-point-tx-hash");
    bytes32 private constant ENTRY_POINT_TX_HASH =
        bytes32(
            0x82e89ea2a1a08573067052ff1c50c3ae43b21ade8989601ca39247c0c34b2e5a
        );

    uint256 private constant SIG_MASTER_KEY = 0;
    uint256 private constant SIG_MASTER_KEY_WITH_RECOVERY_EMAILS = 2;
    uint256 private constant SIG_SESSION_KEY = 3;
    uint256 private constant SIG_NONE = 4;

    uint256 public constant EXPECTED_CALL_SIG_WEIGHT = 1;
    uint256 public constant EXPECTED_CALL_HOOKS_SIG_WEIGHT = 3;
    uint256 public constant EXPECTED_CALL_ACCOUNT_TX_SIG_WEIGHT = 0;

    error UnknownCallDataSelector(bytes4 _selector);

    function getNonce() public view returns (uint256) {
        return uint256(ModuleStorage.readBytes32(NONCE_KEY));
    }

    function _writeNonce(uint256 _nonce) internal {
        ModuleStorage.writeBytes32(NONCE_KEY, bytes32(_nonce));
    }

    function _validateNonceForUserOp(UserOperation calldata userOp)
        internal
        override
    {
        _validateNonce(userOp.nonce);
    }

    function _validateUserOp(UserOperation calldata userOp, bytes32 requestId)
        internal
        view
        override
    {
        bytes calldata callData = userOp.callData;
        (bytes4 selector, ) = callData.cReadBytes4(0);

        require(
            selector == ModuleCall.execFromEntryPoint.selector,
            "_validateUserOp: INVALID_SELECTOR"
        );

        (, uint256 expectedSigWeight) = abi.decode(
            callData[4:],
            (Transaction, uint256)
        );
        (bool success, ) = _validateSignatureWeight(
            expectedSigWeight,
            requestId,
            userOp.signature
        );
        require(success, "_validateSignature: INVALID_SIGNATURE");
    }

    // called by entryPoint, only after validateUserOp succeeded.
    function execFromEntryPoint(
        Transaction calldata _transaction,
        uint256 _sigWeight
    ) external {
        _requireFromEntryPoint();
        _executeOnce(ENTRY_POINT_TX_HASH, _transaction, _sigWeight);
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
                feeAmount
            )
        );

        (bool success, uint256 sigWeight) = _validateSignatureWeight(
            0,
            txhash,
            _signature
        );
        require(success, "execute: INVALID_SIG_WEIGHT");

        _execute(txhash, _txs, sigWeight);
        if (feeAmount != 0) {
            _payFee(feeToken, feeReceiver, feeAmount);
        }
    }

    function _validateNonce(uint256 _nonce) internal virtual {
        uint256 currentNonce = getNonce();
        require(_nonce == currentNonce + 1, "_validateNonce: INVALID_NONCE");
        _writeNonce(_nonce);
    }

    function _execute(
        bytes32 _txHash,
        Transaction[] calldata _txs,
        uint256 _sigWeight
    ) internal {
        for (uint256 i = 0; i < _txs.length; i++) {
            Transaction calldata transaction = _txs[i];
            _executeOnce(_txHash, transaction, _sigWeight);
        }
    }

    function _executeOnce(
        bytes32 _txHash,
        Transaction calldata _transaction,
        uint256 _sigWeight
    ) internal {
        require(gasleft() >= _transaction.gasLimit, "_execute: NOT_ENOUGH_GAS");

        bool success;
        bytes memory result;

        if (_transaction.target == address(this)) {
            require(
                _sigWeight >= getSigWeightOfCallData(_transaction.data),
                "_execute: INVALID_SIG_WEIGHT"
            );
        }

        if (_transaction.callType == CallType.Call) {
            (success, result) = _transaction.target.call{
                value: _transaction.value,
                gas: _transaction.gasLimit == 0
                    ? gasleft()
                    : _transaction.gasLimit
            }(_transaction.data);
        } else if (_transaction.callType == CallType.DelegateCall) {
            (success, result) = _transaction.target.delegatecall{
                gas: _transaction.gasLimit == 0
                    ? gasleft()
                    : _transaction.gasLimit
            }(_transaction.data);
        } else {
            revert InvalidCallType(_transaction.callType);
        }
        if (success) {
            emit TxExecuted(_txHash);
        } else {
            revert TxFailed(_txHash, result);
        }
    }

    function getSigWeightOfCallData(bytes calldata callData)
        public
        pure
        returns (uint256 sigWeight)
    {
        uint256 index = 0;
        bytes4 selector;
        (selector, index) = callData.cReadBytes4(index);
        if (
            selector == ModuleAuthBase.updateKeysetHash.selector ||
            selector == ModuleAuthBase.unlockKeysetHash.selector ||
            selector == ModuleAuthBase.cancelLockKeysetHsah.selector ||
            selector == ModuleAuthBase.updateTimeLockDuring.selector ||
            selector == ModuleAuthBase.updateImplementation.selector ||
            selector == ModuleAuthBase.updateEntryPoint.selector
        ) {
            sigWeight = EXPECTED_CALL_ACCOUNT_TX_SIG_WEIGHT;
        } else if (
            selector == IModuleHooks.addHook.selector ||
            selector == IModuleHooks.removeHook.selector
        ) {
            sigWeight = EXPECTED_CALL_HOOKS_SIG_WEIGHT;
        } else {
            revert UnknownCallDataSelector(selector);
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
