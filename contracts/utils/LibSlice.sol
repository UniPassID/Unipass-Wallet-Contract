// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

/* solhint-disable no-inline-assembly */

struct Slice {
    uint256 _len;
    uint256 _ptr;
}

library LibSlice {
    using LibSlice for Slice;

    function memcpy(
        uint256 dest,
        uint256 src,
        uint256 len
    ) private pure {
        // Copy word-length chunks while possible
        for (; len >= 32; len -= 32) {
            assembly {
                mstore(dest, mload(src))
            }
            dest += 32;
            src += 32;
        }

        // Copy remaining bytes
        uint256 mask = type(uint256).max;
        if (len > 0) {
            mask = 256**(32 - len) - 1;
        }
        assembly {
            let srcpart := and(mload(src), not(mask))
            let destpart := and(mload(dest), mask)
            mstore(dest, or(destpart, srcpart))
        }
    }

    /*
     * @dev Returns a Slice containing the entire string.
     * @param self The string to make a Slice from.
     * @return A newly allocated Slice containing the entire string.
     */
    function stringToSlice(string memory self) internal pure returns (Slice memory) {
        uint256 ptr;
        assembly {
            ptr := add(self, 0x20)
        }
        return Slice(bytes(self).length, ptr);
    }

    function toSlice(bytes memory self) internal pure returns (Slice memory) {
        uint256 ptr;
        assembly {
            ptr := add(self, 0x20)
        }
        return Slice(bytes(self).length, ptr);
    }

    /*
     * @dev Copies a Slice to a new string.
     * @param self The Slice to copy.
     * @return A newly allocated string containing the Slice's text.
     */
    function toBytes(Slice memory self) internal pure returns (bytes memory) {
        bytes memory ret = new bytes(self._len);
        uint256 retptr;
        assembly {
            retptr := add(ret, 32)
        }

        memcpy(retptr, self._ptr, self._len);
        return ret;
    }

    /*
     * @dev Returns a positive number if `other` comes lexicographically after
     *      `self`, a negative number if it comes before, or zero if the
     *      contents of the two Slices are equal. Comparison is done per-rune,
     *      on unicode codepoints.
     * @param self The first Slice to compare.
     * @param other The second Slice to compare.
     * @return The result of the comparison.
     */
    function compare(Slice memory self, Slice memory other) internal pure returns (int256) {
        uint256 shortest = self._len;
        if (other._len < self._len) shortest = other._len;

        uint256 selfptr = self._ptr;
        uint256 otherptr = other._ptr;
        for (uint256 idx = 0; idx < shortest; idx += 32) {
            uint256 a;
            uint256 b;
            assembly {
                a := mload(selfptr)
                b := mload(otherptr)
            }
            if (a != b) {
                // Mask out irrelevant bytes and check again
                uint256 mask = type(uint256).max; // 0xffff...
                if (shortest < 32) {
                    mask = ~(2**(8 * (32 - shortest + idx)) - 1);
                }
                unchecked {
                    uint256 diff = (a & mask) - (b & mask);
                    if (diff != 0) return int256(diff);
                }
            }
            selfptr += 32;
            otherptr += 32;
        }
        return int256(self._len) - int256(other._len);
    }

    /*
     * @dev Returns true if the two Slices contain the same text.
     * @param self The first Slice to compare.
     * @param self The second Slice to compare.
     * @return True if the Slices are equal, false otherwise.
     */
    function equals(Slice memory self, Slice memory other) internal pure returns (bool) {
        return compare(self, other) == 0;
    }

    // Returns the memory address of the first byte of the first occurrence of
    // `needle` in `self`, or the first byte after `self` if not found.
    function findPtr(
        uint256 selflen,
        uint256 selfptr,
        uint256 needlelen,
        uint256 needleptr
    ) private pure returns (uint256) {
        uint256 ptr = selfptr;
        uint256 idx;

        if (needlelen <= selflen) {
            if (needlelen <= 32) {
                bytes32 mask;
                if (needlelen > 0) {
                    mask = bytes32(~(2**(8 * (32 - needlelen)) - 1));
                }

                bytes32 needledata;
                assembly {
                    needledata := and(mload(needleptr), mask)
                }

                uint256 end = selfptr + selflen - needlelen;
                bytes32 ptrdata;
                assembly {
                    ptrdata := and(mload(ptr), mask)
                }

                while (ptrdata != needledata) {
                    if (ptr >= end) return selfptr + selflen;
                    ptr++;
                    assembly {
                        ptrdata := and(mload(ptr), mask)
                    }
                }
                return ptr;
            } else {
                // For long needles, use hashing
                bytes32 hash;
                assembly {
                    hash := keccak256(needleptr, needlelen)
                }

                for (idx = 0; idx <= selflen - needlelen; idx++) {
                    bytes32 testHash;
                    assembly {
                        testHash := keccak256(ptr, needlelen)
                    }
                    if (hash == testHash) return ptr;
                    ptr += 1;
                }
            }
        }
        return selfptr + selflen;
    }

    /*
     * @dev Modifies `self` to contain everything from the first occurrence of
     *      `needle` to the end of the Slice. `self` is set to the empty Slice
     *      if `needle` is not found.
     * @param self The Slice to search and modify.
     * @param needle The text to search for.
     * @return `self`.
     */
    function find(Slice memory self, Slice memory needle) internal pure returns (Slice memory) {
        uint256 ptr = findPtr(self._len, self._ptr, needle._len, needle._ptr);
        self._len -= ptr - self._ptr;
        self._ptr = ptr;
        return self;
    }

    /*
     * @dev Splits the Slice, setting `self` to everything after the first
     *      occurrence of `needle`, and `token` to everything before it. If
     *      `needle` does not occur in `self`, `self` is set to the empty Slice,
     *      and `token` is set to the entirety of `self`.
     * @param self The Slice to split.
     * @param needle The text to search for in `self`.
     * @param token An output parameter to which the first token is written.
     * @return `token`.
     */
    function split(
        Slice memory self,
        Slice memory needle,
        Slice memory token
    ) internal pure returns (Slice memory) {
        uint256 ptr = findPtr(self._len, self._ptr, needle._len, needle._ptr);
        token._ptr = self._ptr;
        token._len = ptr - self._ptr;
        if (ptr == self._ptr + self._len) {
            // Not found
            self._len = 0;
        } else {
            self._len -= token._len + needle._len;
            self._ptr = ptr + needle._len;
        }
        return token;
    }

    /*
     * @dev Splits the Slice, setting `self` to everything after the first
     *      occurrence of `needle`, and returning everything before it. If
     *      `needle` does not occur in `self`, `self` is set to the empty Slice,
     *      and the entirety of `self` is returned.
     * @param self The Slice to split.
     * @param needle The text to search for in `self`.
     * @return The part of `self` up to the first occurrence of `delim`.
     */
    function split(Slice memory self, Slice memory needle) internal pure returns (Slice memory token) {
        split(self, needle, token);
    }

    /*
     * @dev Counts the number of nonoverlapping occurrences of `needle` in `self`.
     * @param self The Slice to search.
     * @param needle The text to search for in `self`.
     * @return The number of occurrences of `needle` found in `self`.
     */
    function count(Slice memory self, Slice memory needle) internal pure returns (uint256 cnt) {
        uint256 ptr = findPtr(self._len, self._ptr, needle._len, needle._ptr) + needle._len;
        while (ptr <= self._ptr + self._len) {
            cnt++;
            ptr = findPtr(self._len - (ptr - self._ptr), ptr, needle._len, needle._ptr) + needle._len;
        }
    }

    /*
     * @dev Returns a newly allocated string containing the concatenation of
     *      `self` and `other`.
     * @param self The first Slice to concatenate.
     * @param other The second Slice to concatenate.
     * @return The concatenation of the two strings.
     */
    function concat(Slice memory self, Slice memory other) internal pure returns (bytes memory) {
        bytes memory ret = new bytes(self._len + other._len);
        uint256 retptr;
        assembly {
            retptr := add(ret, 32)
        }
        memcpy(retptr, self._ptr, self._len);
        memcpy(retptr + self._len, other._ptr, other._len);
        return ret;
    }

    function concatAll(Slice[] memory self) internal pure returns (bytes memory) {
        if (self.length == 0) return "";

        uint256 length = 0;
        for (uint256 i = 0; i < self.length; i++) length += self[i]._len;

        bytes memory ret = new bytes(length);
        uint256 retptr;
        assembly {
            retptr := add(ret, 32)
        }

        for (uint256 i = 0; i < self.length; i++) {
            memcpy(retptr, self[i]._ptr, self[i]._len);
            retptr += self[i]._len;
        }

        return ret;
    }
}
