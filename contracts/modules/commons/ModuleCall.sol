// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

/* solhint-disable no-unused-vars */
/* solhint-disable no-inline-assembly */

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./ModuleStorage.sol";
import "./ModuleNonceBase.sol";
import "./ModuleAuthBase.sol";
import "./ModuleRole.sol";
import "./ModuleTransaction.sol";
import "../../utils/LibBytes.sol";
import "../../interfaces/IModuleHooks.sol";
import "../../interfaces/IModuleCall.sol";
import "../../interfaces/IEIP4337Wallet.sol";

import "hardhat/console.sol";

abstract contract ModuleCall is IModuleCall, ModuleTransaction, ModuleNonceBase, ModuleRole, ModuleAuthBase, IModuleHooks {
    using LibBytes for bytes;
    using SafeERC20 for IERC20;

    // NONCE_KEY = kecaak256("unipass-wallet:module-call:nonce");
    bytes32 private constant NONCE_KEY = bytes32(0x93ed8d86f5d7fd79ac84d87731132a08aec6fc45dd823a5af26bb3e79833c46b);

    error UnknownCallDataSelector(bytes4 _selector);
    error SelectorDoesNotExist(bytes4 _selector);
    error ImmutableSelectorSigWeight(bytes4 _selector);
    error InvalidRole(Role _role);

    function getNonce() public view override returns (uint256) {
        return uint256(ModuleStorage.readBytes32(NONCE_KEY));
    }

    function _writeNonce(uint256 _nonce) internal {
        ModuleStorage.writeBytes32(NONCE_KEY, bytes32(_nonce));
    }

    /**
     * @param _txs Transactions to execute
     * @param _nonce Signature nonce
     * @param _signature Signature bytes
     */
    function execute(
        Transaction[] calldata _txs,
        uint256 _nonce,
        bytes calldata _signature
    ) external payable {
        _validateNonce(_nonce);

        bytes32 txhash = keccak256(abi.encode(_nonce, _txs));
        txhash = _subDigest(txhash);

        (bool succ, RoleWeight memory roleWeight) = validateSignature(txhash, _signature);
        require(succ, "execute: INVALID_SIG_WEIGHT");

        _execute(txhash, _txs, roleWeight);
    }

    function _validateNonce(uint256 _nonce) internal virtual {
        uint256 currentNonce = getNonce();
        require(_nonce == currentNonce + 1, "_validateNonce: INVALID_NONCE");
        _writeNonce(_nonce);
    }

    function _execute(
        bytes32 _txHash,
        Transaction[] calldata _txs,
        RoleWeight memory roleWeight
    ) internal {
        for (uint256 i = 0; i < _txs.length; i++) {
            Transaction calldata transaction = _txs[i];
            _executeOnce(_txHash, transaction, roleWeight);
        }
    }

    function _executeOnce(
        bytes32 _txHash,
        Transaction calldata _transaction,
        RoleWeight memory _roleWeight
    ) internal {
        require(gasleft() >= _transaction.gasLimit, "_execute: NOT_ENOUGH_GAS");

        bool success;
        bytes memory result;

        if (_transaction.target == address(this)) {
            (Role role, uint32 threshold) = _getPermissionOfCallData(_transaction.data);

            require(_validateRoleWeight(role, threshold, _roleWeight), "_execute: INVALID_ROLE_WEIGHT");
        } else {
            require(_roleWeight.assetsOpWeight >= LibRole.ASSETS_OP_THRESHOLD, "_executeOnce: INVALID_ROLE_WEIGHT");
        }

        if (_transaction.callType == CallType.Call) {
            (success, result) = _transaction.target.call{
                value: _transaction.value,
                gas: _transaction.gasLimit == 0 ? gasleft() : _transaction.gasLimit
            }(_transaction.data);
        } else if (_transaction.callType == CallType.DelegateCall) {
            (success, result) = _transaction.target.delegatecall{
                gas: _transaction.gasLimit == 0 ? gasleft() : _transaction.gasLimit
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

    function _getPermissionOfCallData(bytes calldata callData) private view returns (Role role, uint32 threshold) {
        uint256 index = 0;
        bytes4 selector;
        (selector, index) = callData.cReadBytes4(index);
        (role, threshold) = getRoleOfPermission(selector);
    }

    /**
     * @param _callData Calldata of One Transaction
     * @param _digestHash The Hash to valdiate signature
     * @param _signature The internal signature of One Transaction
     */
    function isValidCallData(
        bytes calldata _callData,
        bytes32 _digestHash,
        bytes calldata _signature
    ) external view returns (bool success) {
        (Role role, uint32 threshold) = _getPermissionOfCallData(_callData);
        (bool succ, RoleWeight memory roleWeight) = validateSignature(_digestHash, _signature);

        success = succ && _validateRoleWeight(role, threshold, roleWeight);
    }

    function _validateRoleWeight(
        Role _role,
        uint32 _threshold,
        RoleWeight memory _roleWeight
    ) private pure returns (bool succ) {
        uint32 weight;
        if (_role == Role.Owner) {
            weight = _roleWeight.ownerWeight;
        } else if (_role == Role.AssetsOp) {
            weight = _roleWeight.assetsOpWeight;
        } else if (_role == Role.Guardian) {
            weight = _roleWeight.guardianWeight;
        } else {
            revert InvalidRole(_role);
        }
        succ = weight >= _threshold;
    }
}
