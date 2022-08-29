// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "hardhat/console.sol";

/* solhint-disable no-inline-assembly */

library LibBytes {
    using LibBytes for bytes;

    bytes16 private constant _HEX_SYMBOLS = "0123456789abcdef";

    // Errors
    error ReadFirstUint16OutOfBounds(bytes _data);
    error ReadFirstUint8OutOfBounds(bytes _data);
    error ReadUint8Uint8OutOfBounds(bytes _data, uint256 _index);
    error ReadAddressOutOfBounds(bytes _data, uint256 _index);
    error ReadBytes32OutOfBounds(bytes _data, uint256 _index);
    error ReadUint16OutOfBounds(bytes _data, uint256 _index);
    error ReadBytesOutOfBounds(bytes _datam, uint256 _index, uint256 _length);
    error SplitInvalidNeedle();

    /***********************************|
  |        Read Bytes Functions       |
  |__________________________________*/

    /**
     * @dev Read firsts uint16 value.
     * @param data Byte array to be read.
     * @return a uint16 value of data at index zero.
     * @return newIndex Updated index after reading the values.
     */
    function readFirstUint16(bytes memory data) internal pure returns (uint16 a, uint256 newIndex) {
        if (data.length < 2) revert ReadFirstUint16OutOfBounds(data);
        assembly {
            let word := mload(add(32, data))
            a := shr(240, word)
            newIndex := 2
        }
    }

    function cReadFirstUint16(bytes calldata data) internal pure returns (uint16 a, uint256 newIndex) {
        if (data.length < 2) revert ReadFirstUint16OutOfBounds(data);
        assembly {
            let word := calldataload(data.offset)
            a := shr(240, word)
            newIndex := 2
        }
    }

    function cReadFirstUint8(bytes calldata data) internal pure returns (uint8 a, uint256 newIndex) {
        if (data.length == 0) revert ReadFirstUint8OutOfBounds(data);
        assembly {
            let word := calldataload(data.offset)
            a := shr(248, word)
            newIndex := 1
        }
    }

    function readBytes32(bytes memory b, uint256 index) internal pure returns (bytes32 result) {
        // Arrays are prefixed by a 256 bit length parameter
        uint256 pos = index + 32;

        if (b.length < pos) revert ReadBytes32OutOfBounds(b, index);

        // Read the bytes32 from array memory
        assembly {
            result := mload(add(b, pos))
        }
        return result;
    }

    function readBytesN(
        bytes memory b,
        uint256 index,
        uint32 length
    ) internal pure returns (bytes32 result) {
        // Arrays are prefixed by a 256 bit length parameter
        uint256 pos = index + 32;

        if (b.length < pos) revert ReadBytes32OutOfBounds(b, index);

        // Read the bytes32 from array memory
        assembly {
            result := mload(add(b, pos))
        }

        uint256 offset = (32 - length) * 8;
        result = bytes32((result >> offset) << offset);
    }

    function mcReadBytes32(bytes calldata data, uint256 index) internal pure returns (bytes32 a) {
        assembly {
            a := calldataload(add(data.offset, index))
        }
    }

    function readBytes66(bytes memory data, uint256 index) internal pure returns (bytes memory a, uint256 newIndex) {
        a = new bytes(66);
        assembly {
            let offset := add(32, add(data, index))
            mstore(add(a, 32), mload(offset))
            mstore(add(a, 64), mload(add(offset, 32)))
            mstore(add(a, 66), mload(add(offset, 34)))
            newIndex := add(index, 66)
        }
        assert(newIndex > index);
        require(newIndex <= data.length, "LibBytes#readBytes66: OUT_OF_BOUNDS");
    }

    function mcReadBytesN(
        bytes calldata data,
        uint256 index,
        uint256 length
    ) internal pure returns (bytes32 a) {
        uint256 ret;
        assembly {
            ret := calldataload(add(data.offset, index))
        }
        uint256 offset = (32 - length) * 8;
        a = bytes32((ret >> offset) << offset);
    }

    function mcReadUint8(bytes calldata data, uint256 index) internal pure returns (uint8 a) {
        assembly {
            let word := calldataload(add(data.offset, index))
            a := shr(248, word)
        }
    }

    function cReadUint8Uint8(bytes calldata data, uint256 index)
        internal
        pure
        returns (
            uint8 a,
            uint8 b,
            uint256 newIndex
        )
    {
        assembly {
            let word := calldataload(add(index, data.offset))
            a := shr(248, word)
            b := and(shr(240, word), 0xff)
            newIndex := add(index, 2)
        }
    }

    function cReadAddress(bytes calldata data, uint256 index) internal pure returns (address a, uint256 newIndex) {
        assembly {
            let word := calldataload(add(index, data.offset))
            a := and(shr(96, word), 0xffffffffffffffffffffffffffffffffffffffff)
            newIndex := add(index, 20)
        }
    }

    function cReadBytes4(bytes calldata data, uint256 index) internal pure returns (bytes4 a, uint256 newIndex) {
        assembly {
            a := calldataload(add(index, data.offset))
            newIndex := add(index, 4)
        }
    }

    function cReadUint16(bytes calldata data, uint256 index) internal pure returns (uint16 a, uint256 newIndex) {
        assembly {
            let word := calldataload(add(index, data.offset))
            a := and(shr(240, word), 0xffff)
            newIndex := add(index, 2)
        }
    }

    function cReadUint32(bytes calldata data, uint256 index) internal pure returns (uint32 a, uint256 newIndex) {
        assembly {
            let word := calldataload(add(index, data.offset))
            a := and(shr(224, word), 0xffffffff)
            newIndex := add(index, 4)
        }
    }

    function toLower(bytes calldata bStr) internal pure returns (bytes memory) {
        bytes memory bLower = new bytes(bStr.length);
        for (uint256 i = 0; i < bStr.length; i++) {
            // Uppercase character...
            if ((uint8(bStr[i]) >= 65) && (uint8(bStr[i]) <= 90)) {
                // So we add 32 to make it lowercase
                bLower[i] = bytes1(uint8(bStr[i]) + 32);
            } else {
                bLower[i] = bStr[i];
            }
        }
        return bLower;
    }

    function toLowerMemory(bytes memory bStr) internal pure returns (bytes memory) {
        bytes memory bLower = new bytes(bStr.length);
        for (uint256 i = 0; i < bStr.length; i++) {
            // Uppercase character...
            if ((uint8(bStr[i]) >= 65) && (uint8(bStr[i]) <= 90)) {
                // So we add 32 to make it lowercase
                bLower[i] = bytes1(uint8(bStr[i]) + 32);
            } else {
                bLower[i] = bStr[i];
            }
        }
        return bLower;
    }

    function toHex(uint256 value, uint256 length) internal pure returns (bytes memory) {
        bytes memory buffer = new bytes(2 * length + 2);
        buffer[0] = "0";
        buffer[1] = "x";
        for (uint256 i = 2 * length + 1; i > 1; --i) {
            buffer[i] = _HEX_SYMBOLS[value & 0xf];
            value >>= 4;
        }
        require(value == 0, "Strings: hex length insufficient");
        return buffer;
    }

    function findBytes1(
        bytes calldata self,
        uint256 _index,
        bytes1 _needle
    ) internal pure returns (uint256 index) {
        for (index = _index; index < self.length; index++) {
            if (self[index] == _needle) {
                return index;
            }
        }
        revert SplitInvalidNeedle();
    }

    function findBytes(
        bytes calldata self,
        uint256 _index,
        bytes calldata _needle
    ) internal pure returns (uint256 index) {
        uint256 selfLength = self.length;
        uint256 needleLength = _needle.length;
        for (index = _index; index < selfLength; index++) {
            uint256 innerIndex;
            for (innerIndex; innerIndex < needleLength; innerIndex++) {
                if (self[index + innerIndex] != _needle[innerIndex]) {
                    break;
                }
            }
            if (innerIndex == needleLength) {
                return index;
            }
        }
        revert SplitInvalidNeedle();
    }
}
