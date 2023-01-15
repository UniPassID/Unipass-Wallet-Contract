// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

/* solhint-disable no-unused-vars */
/* solhint-disable no-inline-assembly */

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./ModuleStorage.sol";
import "./ModuleAuthBase.sol";
import "./ModuleRole.sol";
import "./ModuleTransaction.sol";
import "../utils/LibUnipassSig.sol";
import "../../utils/LibBytes.sol";
import "../../utils/LibOptim.sol";
import "../../interfaces/IModuleHooks.sol";
import "../../interfaces/IModuleCall.sol";

abstract contract ModuleCall is IModuleCall, ModuleTransaction, ModuleRole, ModuleAuthBase, IModuleHooks {
    using LibBytes for bytes;
    using SafeERC20 for IERC20;

    // NONCE_KEY = kecaak256("unipass-wallet:module-call:nonce");
    bytes32 private constant NONCE_KEY = bytes32(0x93ed8d86f5d7fd79ac84d87731132a08aec6fc45dd823a5af26bb3e79833c46b);

    function getNonce() public view returns (uint256) {
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
    function execute(Transaction[] calldata _txs, uint256 _nonce, bytes calldata _signature) external payable {
        _validateNonce(_nonce);

        bytes32 txhash = LibUnipassSig._subDigest(keccak256(abi.encode(_nonce, _txs)), block.chainid);

        (
            bool succ,
            IDkimKeys.EmailType emailType,
            uint32 ownerWeight,
            uint32 assetsOpWeight,
            uint32 guardianWeight
        ) = validateSignature(txhash, _signature);
        require(
            emailType == IDkimKeys.EmailType.None || emailType == IDkimKeys.EmailType.CallOtherContract,
            "execute: INVALID_EMAIL"
        );
        require(succ, "execute: INVALID_SIG_WEIGHT");

        _execute(txhash, _txs, ownerWeight, assetsOpWeight, guardianWeight);
    }

    function selfExecute(
        uint32 _ownerWeight,
        uint32 _assetsOpWeight,
        uint32 _guardianWeight,
        Transaction[] calldata _txs
    ) external onlySelf {
        // Hash transaction bundle
        bytes32 txHash = LibUnipassSig._subDigest(keccak256(abi.encode("self:", _txs)), block.chainid);

        // Execute the transactions
        _execute(txHash, _txs, _ownerWeight, _assetsOpWeight, _guardianWeight);
    }

    function _validateNonce(uint256 _nonce) internal virtual {
        uint256 currentNonce = getNonce();
        require(_nonce == currentNonce + 1, "_validateNonce: INVALID_NONCE");
        _writeNonce(_nonce);
    }

    function _execute(
        bytes32 _txHash,
        Transaction[] calldata _txs,
        uint32 _ownerWeight,
        uint32 _assetsOpWeight,
        uint32 _guardianWeight
    ) internal {
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

            if (transaction.target == address(this)) {
                (uint32 ownerWeight, uint32 assetsOpWeight, uint32 guardianWeight) = _getPermissionOfCallData(transaction.data);

                require(
                    _ownerWeight >= ownerWeight && _assetsOpWeight >= assetsOpWeight && _guardianWeight >= guardianWeight,
                    "_execute: INVALID_ROLE_WEIGHT"
                );
            } else {
                require(_assetsOpWeight >= LibRole.ASSETS_OP_THRESHOLD, "_executeOnce: INVALID_ROLE_WEIGHT");
            }

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

    function _getPermissionOfCallData(
        bytes calldata callData
    ) private view returns (uint32 ownerWeight, uint32 assetsWeight, uint32 guardianWeight) {
        uint256 index;
        bytes4 selector;
        (selector, index) = callData.cReadBytes4(index);
        if (selector == this.selfExecute.selector) {
            ownerWeight = uint32(uint256(callData.mcReadBytes32(index)));
            index += 32;
            assetsWeight = uint32(uint256(callData.mcReadBytes32(index)));
            index += 32;
            guardianWeight = uint32(uint256(callData.mcReadBytes32(index)));
            index += 32;
        } else {
            (ownerWeight, assetsWeight, guardianWeight) = getRoleOfPermission(selector);
        }
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
    ) external view override returns (bool success) {
        (
            bool succ,
            IDkimKeys.EmailType emailType,
            uint32 ownerWeight,
            uint32 assetsOpWeight,
            uint32 guardianWeight
        ) = validateSignature(_digestHash, _signature);

        (uint32 ownerWeightThreshold, uint32 assetsOpWeightThreshold, uint32 guardianWeightThreshold) = _getPermissionOfCallData(
            _callData
        );

        success =
            succ &&
            emailType == IDkimKeys.EmailType.None &&
            ownerWeight >= ownerWeightThreshold &&
            assetsOpWeight >= assetsOpWeightThreshold &&
            guardianWeight >= guardianWeightThreshold;
    }
}
