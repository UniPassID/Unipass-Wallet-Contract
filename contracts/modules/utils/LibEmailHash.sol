// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "../../utils/LibBytes.sol";
import "../../utils/LibBase64.sol";

import "hardhat/console.sol";

library LibEmailHash {
    function emailAddressHash(bytes memory from) internal pure returns (bytes32) {
        uint256 emailLength = 124;
        require(from.length < emailLength, "too long");
        uint256 diff = emailLength - from.length;
        bytes memory padding = new bytes(diff);
        bytes32 hash = sha256(abi.encodePacked(from, padding));
        hash = reverse(hash);
        hash &= 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff1f;
        return hash;
    }

    function reverse(bytes32 input) internal pure returns (bytes32 v) {
        v = input;

        // swap bytes
        v =
            ((v & 0xFF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00) >> 8) |
            ((v & 0x00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF) << 8);

        // swap 2-byte long pairs
        v =
            ((v & 0xFFFF0000FFFF0000FFFF0000FFFF0000FFFF0000FFFF0000FFFF0000FFFF0000) >> 16) |
            ((v & 0x0000FFFF0000FFFF0000FFFF0000FFFF0000FFFF0000FFFF0000FFFF0000FFFF) << 16);

        // swap 4-byte long pairs
        v =
            ((v & 0xFFFFFFFF00000000FFFFFFFF00000000FFFFFFFF00000000FFFFFFFF00000000) >> 32) |
            ((v & 0x00000000FFFFFFFF00000000FFFFFFFF00000000FFFFFFFF00000000FFFFFFFF) << 32);

        // swap 8-byte long pairs
        v =
            ((v & 0xFFFFFFFFFFFFFFFF0000000000000000FFFFFFFFFFFFFFFF0000000000000000) >> 64) |
            ((v & 0x0000000000000000FFFFFFFFFFFFFFFF0000000000000000FFFFFFFFFFFFFFFF) << 64);

        // swap 16-byte long pairs
        v = (v >> 128) | (v << 128);
    }
}
