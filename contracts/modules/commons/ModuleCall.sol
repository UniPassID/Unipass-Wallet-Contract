// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

/* solhint-disable no-unused-vars */

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./ModuleStorage.sol";
import "./ModuleAuthBase.sol";
import "../../utils/LibBytes.sol";
import "../../interfaces/IModuleHooks.sol";
import "../../interfaces/ITransaction.sol";
import "../../interfaces/IModuleCall.sol";
import "../../interfaces/IEIP4337Wallet.sol";

abstract contract ModuleCall is
    ITransaction,
    IModuleCall,
    ModuleAuthBase,
    IModuleHooks
{
    using LibBytes for bytes;
    using SafeERC20 for IERC20;

    // NONCE_KEY = kecaak256("unipass-wallet:module-call:nonce");
    bytes32 private constant NONCE_KEY =
        bytes32(
            0x93ed8d86f5d7fd79ac84d87731132a08aec6fc45dd823a5af26bb3e79833c46b
        );
    mapping(bytes4 => uint256) private selectorSigWeightMap;

    uint256 private constant SIG_MASTER_KEY = 0;
    uint256 private constant SIG_MASTER_KEY_WITH_RECOVERY_EMAILS = 2;
    uint256 private constant SIG_SESSION_KEY = 3;
    uint256 private constant SIG_NONE = 4;

    uint256 private constant EXPECTED_CALL_SIG_WEIGHT = 1;
    uint256 private constant EXPECTED_CALL_HOOKS_SIG_WEIGHT = 3;
    uint256 private constant EXPECTED_CALL_ACCOUNT_TX_SIG_WEIGHT = 0;
    uint256 private constant EXPECTED_EXECUTE_SIG_WEIGHT = 0;

    error UnknownCallDataSelector(bytes4 _selector);
    error SelectorDoesNotExist(bytes4 _selector);
    error ImmutableSelectorSigWeight(bytes4 _selector);

    function getNonce() public view returns (uint256) {
        return uint256(ModuleStorage.readBytes32(NONCE_KEY));
    }

    function _writeNonce(uint256 _nonce) internal {
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
                feeAmount
            )
        );

        (bool success, uint256 sigWeight) = validateSignatureWeight(
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

    function _getSigWeightOfSelector(bytes4 _selector)
        internal
        view
        returns (uint256 sigWeight)
    {
        if (
            _selector == ModuleAuthBase.updateKeysetHash.selector ||
            _selector == ModuleAuthBase.unlockKeysetHash.selector ||
            _selector == ModuleAuthBase.cancelLockKeysetHsah.selector ||
            _selector == ModuleAuthBase.updateTimeLockDuring.selector ||
            _selector == ModuleAuthBase.updateImplementation.selector
        ) {
            sigWeight = EXPECTED_CALL_ACCOUNT_TX_SIG_WEIGHT;
        } else if (
            _selector == IModuleHooks.addHook.selector ||
            _selector == IModuleHooks.removeHook.selector ||
            _selector == ModuleCall.addSigWeightOfSelector.selector ||
            _selector == ModuleCall.removeSigWeightOfSelector.selector
        ) {
            sigWeight = EXPECTED_CALL_HOOKS_SIG_WEIGHT;
        } else if (_selector == ModuleCall.execute.selector) {
            sigWeight = EXPECTED_EXECUTE_SIG_WEIGHT;
        } else {
            sigWeight = selectorSigWeightMap[_selector];
            if (sigWeight > 0) {
                sigWeight--;
            } else {
                revert UnknownCallDataSelector(_selector);
            }
        }
    }

    function _requireMutableSigWeightOfSelector(bytes4 _selector) private pure {
        if (
            _selector == ModuleAuthBase.updateKeysetHash.selector ||
            _selector == ModuleAuthBase.unlockKeysetHash.selector ||
            _selector == ModuleAuthBase.cancelLockKeysetHsah.selector ||
            _selector == ModuleAuthBase.updateTimeLockDuring.selector ||
            _selector == ModuleAuthBase.updateImplementation.selector ||
            _selector == IModuleHooks.addHook.selector ||
            _selector == IModuleHooks.removeHook.selector
        ) {
            revert ImmutableSelectorSigWeight(_selector);
        }
    }

    function addSigWeightOfSelector(bytes4 _selector, uint256 _sigWeight)
        external
        onlySelf
    {
        _requireMutableSigWeightOfSelector(_selector);
        selectorSigWeightMap[_selector] = _sigWeight + 1;
    }

    function removeSigWeightOfSelector(bytes4 _selector) external onlySelf {
        _requireMutableSigWeightOfSelector(_selector);
        if (selectorSigWeightMap[_selector] == 0) {
            revert SelectorDoesNotExist(_selector);
        }
        selectorSigWeightMap[_selector] = 0;
    }

    function getSigWeightOfCallData(bytes calldata callData)
        public
        view
        override
        returns (uint256 sigWeight)
    {
        uint256 index = 0;
        bytes4 selector;
        (selector, index) = callData.cReadBytes4(index);
        sigWeight = _getSigWeightOfSelector(selector);
    }

    function isValidateCallData(
        bytes calldata _callData,
        bytes32 _digestHash,
        bytes calldata _signature
    ) external view returns (bool success) {
        uint256 sigWeight = getSigWeightOfCallData(_callData);
        (success, ) = validateSignatureWeight(
            sigWeight,
            _digestHash,
            _signature
        );
    }

    function _payFee(
        address feeToken,
        address feeReceiver,
        uint256 feeAmount
    ) private {
        // transfer native token to msg.sender
        if (feeToken == address(0))
            feeReceiver.call{value: feeAmount}("");
            // transfer erc20 token to msg.sender
        else IERC20(feeToken).safeTransfer(feeReceiver, feeAmount);
    }
}
