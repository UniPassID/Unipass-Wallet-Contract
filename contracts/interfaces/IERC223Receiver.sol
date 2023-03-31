// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

interface IERC223Receiver {
    function tokenFallback(
        address,
        uint256,
        bytes calldata
    ) external;
}
