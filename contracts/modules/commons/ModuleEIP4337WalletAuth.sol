// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

/* solhint-disable avoid-low-level-calls */
/* solhint-disable no-inline-assembly */
/* solhint-disable reason-string */

import "./ModuleStorage.sol";
import "./ModuleEIP4337WalletAuthBase.sol";
import "../../UserOperation.sol";

/**
 * Basic wallet implementation.
 * this contract provides the basic logic for implementing the IWallet interface  - validateUserOp
 * specific wallet implementation should inherit it and provide the wallet-specific logic
 */
contract ModuleEIP4337WalletAuth is ModuleEIP4337WalletAuthBase {
    using UserOperationLib for UserOperation;

    address public immutable ENTRY_POINT;

    //                       ENTRY_POINT_KEY = keccak256("unipass-wallet:module-auth:entry-point")
    bytes32 private constant ENTRY_POINT_KEY =
        bytes32(
            0x111d20901a299c6b87b5b526dd366dca9c9706d966ddc5f76b9c42eab038a0e5
        );

    constructor(address _entryPoint) {
        ENTRY_POINT = _entryPoint;
    }

    /**
     * return the entryPoint used by this wallet.
     * subclass should return the current entryPoint used by this wallet.
     */
    function getEntryPoint() public view virtual returns (address entryPoint) {
        entryPoint = address(
            uint160(uint256(ModuleStorage.readBytes32(ENTRY_POINT_KEY)))
        );
        if (entryPoint == address(0)) {
            entryPoint = ENTRY_POINT;
        }
    }

    function _writeEntryPoint(address newEntryPoint) internal {
        ModuleStorage.writeBytes32(
            ENTRY_POINT_KEY,
            bytes32(uint256(uint160(newEntryPoint)))
        );
    }

    /**
     * ensure the request comes from the known entrypoint.
     */
    function _requireFromEntryPoint() internal view override {
        require(
            msg.sender == address(getEntryPoint()),
            "_requireFromEntryPoint: INVALID_FROM"
        );
    }
}
