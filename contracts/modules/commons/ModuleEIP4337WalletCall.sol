// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

/* solhint-disable avoid-low-level-calls */
/* solhint-disable no-inline-assembly */
/* solhint-disable reason-string */

import "./ModuleStorage.sol";
import "./ModuleEIP4337WalletAuthBase.sol";
import "../../interfaces/IEIP4337Wallet.sol";

/**
 * Basic wallet implementation.
 * this contract provides the basic logic for implementing the IWallet interface  - validateUserOp
 * specific wallet implementation should inherit it and provide the wallet-specific logic
 */
abstract contract ModuleEIP4337WalletCall is
    IEIP4337Wallet,
    ModuleEIP4337WalletAuthBase
{
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
            _validateNonceForUserOp(userOp);
        }
        _payPrefund(missingWalletFunds);
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
            (bool success, ) = payable(msg.sender).call{
                value: missingWalletFunds,
                gas: type(uint256).max
            }("");
            (success);
            //ignore failure (its EntryPoint's job to verify, not wallet.)
        }
    }

    /**
     * validate the current nonce matches the UserOperation nonce.
     * then it should update the wallet's state to prevent replay of this UserOperation.
     * called only if initCode is empty (since "nonce" field is used as "salt" on wallet creation)
     * @param userOp the op to validate.
     */
    function _validateNonceForUserOp(UserOperation calldata userOp)
        internal
        virtual;

    /**
     * validate the signature is valid for this message.
     * @param userOp validate the userOp.signature field
     * @param requestId convenient field: the hash of the request, to check the signature against
     *          (also hashes the entrypoint and chain-id)
     */
    function _validateUserOp(UserOperation calldata userOp, bytes32 requestId)
        internal
        view
        virtual;
}
