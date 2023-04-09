// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import "../../utils/LibBytes.sol";
import "../../utils/LibBase64.sol";

import "hardhat/console.sol";

library LibEmailHash {
    function emailAddressHash(bytes calldata emailFrom, bytes32 pepper) internal pure returns (bytes32 emailHash) {
        emailHash = sha256(abi.encodePacked(emailFrom, pepper));
    }
}
