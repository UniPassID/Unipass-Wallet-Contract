// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

interface IDkimKeys {
    function getDKIMKey(bytes calldata _emailServer)
        external
        view
        returns (bytes memory);
}
