// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./ModuleCall.sol";

abstract contract ModuleCallIgnore is ModuleCall {
    function _validateNonce(uint256 _nonce) internal override {
        uint256 currentNonce = getNonce();
        require(
            _nonce == currentNonce + 1,
            "ModuleCall#_validateNonce: INVALID_NONCE"
        );
        _writeNonce(_nonce);
    }
}
