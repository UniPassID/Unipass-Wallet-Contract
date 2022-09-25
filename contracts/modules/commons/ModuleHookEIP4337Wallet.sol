// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

/* solhint-disable avoid-low-level-calls */
/* solhint-disable no-inline-assembly */
/* solhint-disable reason-string */

import "./ModuleStorage.sol";
import "./ModuleSelfAuth.sol";
import "./ModuleRole.sol";
import "./ModuleTransaction.sol";
import "../../UserOperation.sol";
import "../../interfaces/IEIP4337Wallet.sol";
import "../../interfaces/IModuleCall.sol";
import "../../interfaces/IModuleAccount.sol";
import "../../interfaces/IModuleAuth.sol";
import "../../utils/LibBytes.sol";

import "@openzeppelin/contracts/utils/Address.sol";

import "hardhat/console.sol";

/**
 * Basic wallet implementation.
 * this contract provides the basic logic for implementing the IWallet interface  - validateUserOp
 * specific wallet implementation should inherit it and provide the wallet-specific logic
 */
contract ModuleHookEIP4337Wallet is ModuleTransaction, IEIP4337Wallet, ModuleSelfAuth {
    using UserOperationLib for UserOperation;
    using Address for address;
    using LibBytes for bytes;

    address public immutable ENTRY_POINT;

    //                       ENTRY_POINT_KEY = keccak256("unipass-wallet:module-hook-eip4337-wallet:entry-point")
    bytes32 private constant ENTRY_POINT_KEY = bytes32(0x06f757a338bda2d50616d8b9f12f755f66fab01c0eb54b1926b257c970e16ba1);

    //                       EIP4337_WALLET_NONCE_KEY = keccak256("unipass-wallet:module-hook-eip4337-wallet:eip4337-wallet-nonce")
    bytes32 private constant EIP4337_WALLET_NONCE_KEY =
        bytes32(0x9190635b97808fd3d18811bd3d940c445971100d934599c77d259adaac8633c1);

    error InvalidEntryPoint(address _entryPoint);

    constructor(address _entryPoint) {
        ENTRY_POINT = _entryPoint;
    }

    function _requireEIP4337WalletNonce(uint256 _nonce) private view {
        require(getEIP4337WalletNonce() + 1 == _nonce, "_requireEIP4337WalletNonce: INVALID_NONCE");
    }

    function getEIP4337WalletNonce() public view returns (uint256 eip4337WalletNonce) {
        eip4337WalletNonce = (uint256)(ModuleStorage.readBytes32(EIP4337_WALLET_NONCE_KEY));
    }

    function _writeEIP4337WalletNonce(uint256 _nonce) private {
        ModuleStorage.writeBytes32(EIP4337_WALLET_NONCE_KEY, bytes32(_nonce));
    }

    /**
     * return the entryPoint used by this wallet.
     * subclass should return the current entryPoint used by this wallet.
     */
    function getEntryPoint() public view virtual returns (address entryPoint) {
        entryPoint = address(uint160(uint256(ModuleStorage.readBytes32(ENTRY_POINT_KEY))));
        if (entryPoint == address(0)) {
            entryPoint = ENTRY_POINT;
        }
    }

    function updateEntryPoint(uint32 _eip4337WalletNonce, address _newEntryPoint) external onlySelf {
        _requireEIP4337WalletNonce(_eip4337WalletNonce);
        if (!_newEntryPoint.isContract()) {
            revert InvalidEntryPoint(_newEntryPoint);
        }

        _writeEntryPoint(_newEntryPoint);
        _writeEIP4337WalletNonce(_eip4337WalletNonce);
    }

    function _writeEntryPoint(address newEntryPoint) internal {
        ModuleStorage.writeBytes32(ENTRY_POINT_KEY, bytes32(uint256(uint160(newEntryPoint))));
    }

    /**
     * ensure the request comes from the known entrypoint.
     */
    function _requireFromEntryPoint() internal view {
        require(msg.sender == address(getEntryPoint()), "_requireFromEntryPoint: INVALID_FROM");
    }

    /**
     * Validate user's signature and nonce.
     * subclass doesn't override this method. instead, it should override the specific internal validation methods.
     */
    function validateUserOp(
        UserOperation calldata userOp,
        bytes32 requestId,
        uint256 missingWalletFunds
    ) external override {
        _requireFromEntryPoint();
        _validateUserOp(userOp, requestId);
        //during construction, the "nonce" field hold the salt.
        // if we assert it is zero, then we allow only a single wallet per owner.
        if (userOp.initCode.length == 0) {
            _validateAndUpdateNonce(userOp);
        }
        _payPrefund(missingWalletFunds);
    }

    /**
     * validate the current nonce matches the UserOperation nonce.
     * then it should update the wallet's state to prevent replay of this UserOperation.
     * called only if initCode is empty (since "nonce" field is used as "salt" on wallet creation)
     * @param _userOp the op to validate.
     */
    function _validateAndUpdateNonce(UserOperation calldata _userOp) private {
        _requireEIP4337WalletNonce(_userOp.nonce);
        _writeEIP4337WalletNonce(_userOp.nonce);
    }

    /**
     * validate the signature is valid for this message.
     * @param userOp validate the userOp.signature field
     * @param requestId convenient field: the hash of the request, to check the signature against
     *          (also hashes the entrypoint and chain-id)
     */
    function _validateUserOp(UserOperation calldata userOp, bytes32 requestId) private view {
        require(
            bytes4(userOp.callData[:4]) == ModuleHookEIP4337Wallet.execFromEntryPoint.selector,
            "_validateUserOp: INVALID_SELECTOR"
        );
        Transaction memory transaction;
        (transaction) = abi.decode(userOp.callData[4:], (Transaction));
        if (transaction.target != address(this)) {
            (bool success, IDkimKeys.EmailType emailType, , uint32 assetsOpWeight, ) = IModuleAuth(address(this))
                .validateSignature(requestId, userOp.signature);
            require(
                success &&
                    (emailType == IDkimKeys.EmailType.None || emailType == IDkimKeys.EmailType.CallOtherContract) &&
                    assetsOpWeight >= LibRole.ASSETS_OP_THRESHOLD,
                "execute: INVALID_SIG_WEIGHT"
            );
        } else {
            bool success = IModuleCall(userOp.sender).isValidCallData(transaction.data, requestId, userOp.signature);

            require(success, "_validateUserOp: INVALID_SIGNATURE");
        }
    }

    /**
     * sends to the entrypoint (msg.sender) the missing funds for this transaction.
     * subclass MAY override this method for better funds management
     * (e.g. send to the entryPoint more than the minimum required, so that in future transactions
     * it will not be required to send again)
     * @param missingWalletFunds the minimum value this method should send the entrypoint.
     *  this value MAY be zero, in case there is enough deposit, or the userOp has a paymaster.
     */
    function _payPrefund(uint256 missingWalletFunds) internal virtual {
        if (missingWalletFunds != 0) {
            //pay required prefund. make sure NOT to use the "gas" opcode, which is banned during validateUserOp
            // (and used by default by the "call")
            (bool success, ) = payable(msg.sender).call{value: missingWalletFunds, gas: type(uint256).max}("");
            (success);
            //ignore failure (its EntryPoint's job to verify, not wallet.)
        }
    }

    // called by entryPoint, only after validateUserOp succeeded.
    function execFromEntryPoint(Transaction calldata _transaction) external {
        _requireFromEntryPoint();
        _call(_transaction);
    }

    function _call(Transaction calldata _transaction) internal {
        bool success;
        bytes memory result;
        if (_transaction.callType == CallType.Call) {
            (success, result) = _transaction.target.call{
                value: _transaction.value,
                gas: _transaction.gasLimit == 0 ? gasleft() : _transaction.gasLimit
            }(_transaction.data);
        } else {
            revert InvalidCallType(_transaction.callType);
        }
        require(success, "_call: EXEC_FALIED");
    }
}
