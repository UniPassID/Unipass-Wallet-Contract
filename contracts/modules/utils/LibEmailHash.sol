// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.15;

import "../../utils/LibBytes.sol";
import "../../utils/LibBase64.sol";

library LibEmailHash {
    function emailAddressHash(bytes calldata emailFrom, bytes32 pepper) internal pure returns (bytes32 emailHash) {
        emailHash = sha256(abi.encodePacked(emailFrom, pepper));
    }
}
