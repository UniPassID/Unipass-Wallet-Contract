// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "../../utils/LibBytes.sol";
import "../../utils/LibSlice.sol";
import "../../utils/LibBase64.sol";

struct DkimParams {
    bytes emailHeader;
    bytes dkimSig;
    uint256 fromIndex;
    uint256 fromLeftIndex;
    uint256 fromRightIndex;
    uint256 subjectIndex;
    uint256 subjectRightIndex;
    bool[] isSubBase64;
    bytes subjectPadding;
    bytes[] subject;
    uint256 dkimHeaderIndex;
    uint256 selectorIndex;
    uint256 selectorRightIndex;
    uint256 sdidIndex;
    uint256 sdidRightIndex;
}

library LibDkimValidator {
    using LibBytes for bytes;
    using LibDkimValidator for DkimParams;
    using LibSlice for Slice;

    function getEmailHash(bytes memory fromEmail, bytes memory sdid)
        internal
        pure
        returns (bytes32 emailHash)
    {
        Slice memory headerSlice = LibSlice.toSlice(fromEmail);
        Slice memory atSlice = LibSlice.stringToSlice("@");
        Slice memory localPart = LibSlice.split(headerSlice, atSlice);
        Slice memory sdidSlice = LibSlice.toSlice(sdid);
        require(
            headerSlice.equals(LibSlice.stringToSlice("mail.unipass.me")) ||
                headerSlice.equals(sdidSlice),
            "ED"
        );

        if (sdidSlice.equals(LibSlice.stringToSlice("gmail.com"))) {
            emailHash = emailAddressHash(
                checkFromHeader(localPart, atSlice, headerSlice)
            );
        } else {
            emailHash = emailAddressHash(fromEmail);
        }
    }

    function checkFromHeader(
        Slice memory localPart,
        Slice memory atSlice,
        Slice memory domainPart
    ) internal pure returns (bytes memory fromRet) {
        Slice memory dotSlice = LibSlice.stringToSlice(".");
        Slice[] memory localPartArray = new Slice[](
            localPart.count(dotSlice) + 3
        );
        for (uint256 i = 0; i < localPartArray.length - 2; i++) {
            localPartArray[i] = localPart.split(dotSlice);
        }
        localPartArray[localPartArray.length - 2] = atSlice;
        localPartArray[localPartArray.length - 1] = domainPart;
        fromRet = LibSlice.concat_all(localPartArray);
        return fromRet;
    }

    function emailAddressHash(bytes memory from)
        internal
        pure
        returns (bytes32)
    {
        uint256 emailLength = 124;
        require(from.length < emailLength, "to long");
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
            ((v &
                0xFF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00) >>
                8) |
            ((v &
                0x00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF) <<
                8);

        // swap 2-byte long pairs
        v =
            ((v &
                0xFFFF0000FFFF0000FFFF0000FFFF0000FFFF0000FFFF0000FFFF0000FFFF0000) >>
                16) |
            ((v &
                0x0000FFFF0000FFFF0000FFFF0000FFFF0000FFFF0000FFFF0000FFFF0000FFFF) <<
                16);

        // swap 4-byte long pairs
        v =
            ((v &
                0xFFFFFFFF00000000FFFFFFFF00000000FFFFFFFF00000000FFFFFFFF00000000) >>
                32) |
            ((v &
                0x00000000FFFFFFFF00000000FFFFFFFF00000000FFFFFFFF00000000FFFFFFFF) <<
                32);

        // swap 8-byte long pairs
        v =
            ((v &
                0xFFFFFFFFFFFFFFFF0000000000000000FFFFFFFFFFFFFFFF0000000000000000) >>
                64) |
            ((v &
                0x0000000000000000FFFFFFFFFFFFFFFF0000000000000000FFFFFFFFFFFFFFFF) <<
                64);

        // swap 16-byte long pairs
        v = (v >> 128) | (v << 128);
    }

    function parseHeader(DkimParams calldata self)
        internal
        pure
        returns (
            bytes32 emailHash,
            bytes memory sigHashHex,
            bytes memory sdid,
            bytes memory selector
        )
    {
        // see https://www.rfc-editor.org/rfc/rfc2822#section-3.4.1
        require(
            self.fromIndex + 4 < self.fromLeftIndex &&
                self.fromLeftIndex < self.fromRightIndex,
            "LE"
        );
        if (self.fromIndex != 0) {
            require(
                self.emailHeader.readBytesN(self.fromIndex - 2, 7) ==
                    bytes32("\r\nfrom:"),
                "FE"
            );
        } else {
            require(
                self.emailHeader.readBytesN(self.fromIndex, 5) ==
                    bytes32("from:"),
                "FE"
            );
        }
        require(
            self.fromIndex + 4 < self.fromLeftIndex &&
                self.fromLeftIndex < self.fromRightIndex,
            "LE"
        );
        if (
            self.emailHeader[self.fromLeftIndex - 1] == "<" &&
            self.emailHeader[self.fromRightIndex + 1] == ">"
        ) {
            for (
                uint256 i = self.fromLeftIndex - 1;
                i > self.fromIndex + 4;
                i--
            ) {
                require(self.emailHeader[i] != "\n", "NE");
            }
        } else {
            require(self.fromLeftIndex == self.fromIndex + 5, "AE");
        }
        // see https://datatracker.ietf.org/doc/html/rfc5322#section-2.2

        if (self.subjectIndex != 0) {
            require(
                self.emailHeader.readBytesN(self.subjectIndex - 2, 10) ==
                    bytes32("\r\nsubject:"),
                "FE"
            );
        } else {
            require(
                self.emailHeader.readBytesN(self.subjectIndex, 8) ==
                    bytes32("subject:"),
                "FE"
            );
        }
        // see https://datatracker.ietf.org/doc/html/rfc5322#section-2.2
        for (
            uint256 i = self.subjectIndex + 8;
            i < self.subjectRightIndex;
            i++
        ) {
            require(self.emailHeader[i] != "\n", "NE");
        }

        (bytes memory subject, uint256 _newIndex) = self.emailHeader.readBytes(
            self.subjectIndex + 8,
            self.subjectRightIndex - self.subjectIndex - 8
        );

        (bool succ, bytes memory ret) = checkSubjectHeader(
            subject,
            self.subject,
            self.isSubBase64,
            self.subjectPadding
        );
        require(succ, "SHE");
        require(ret.length == 66, "SHE");
        sigHashHex = ret;

        require(
            self.emailHeader.readBytesN(self.dkimHeaderIndex - 2, 17) ==
                bytes32("\r\ndkim-signature:"),
            "DE"
        );
        require(
            self.selectorIndex > self.dkimHeaderIndex &&
                self.sdidIndex > self.dkimHeaderIndex,
            "DHE"
        );

        require(
            self.emailHeader.readBytesN(self.sdidIndex - 4, 4) ==
                bytes32("; d="),
            "DDE"
        );
        (sdid, _newIndex) = self.emailHeader.readBytes(
            self.sdidIndex,
            self.sdidRightIndex - self.sdidIndex
        );

        require(
            self.emailHeader.readBytesN(self.selectorIndex - 4, 4) ==
                bytes32("; s="),
            "DSE"
        );
        (selector, _newIndex) = self.emailHeader.readBytes(
            self.selectorIndex,
            self.selectorRightIndex - self.selectorIndex
        );

        bytes memory fromHeader;
        (fromHeader, _newIndex) = self.emailHeader.readBytes(
            self.fromLeftIndex,
            self.fromRightIndex - self.fromLeftIndex + 1
        );
        bytes memory email = LibBytes.toLower(fromHeader);
        emailHash = getEmailHash(email, sdid);

        return (emailHash, sigHashHex, sdid, selector);
    }

    function checkSubjectHeader(
        bytes memory header,
        bytes[] memory decodedHeader,
        bool[] memory isBase64,
        bytes memory subjectPadding
    ) internal pure returns (bool, bytes memory ret) {
        require(subjectPadding.length < 3, "SPE");
        require(
            decodedHeader.length > 0 && isBase64.length == decodedHeader.length,
            "DHE"
        );

        Slice memory headerSlice = LibSlice.toSlice(header);

        Slice memory part;
        uint256 ptr = headerSlice._ptr;
        Slice memory headerPart;
        Slice[] memory retPart = new Slice[](decodedHeader.length);
        for (uint256 i = 0; i < decodedHeader.length; i++) {
            headerPart = LibSlice.toSlice(decodedHeader[i]);
            part = headerSlice.split(headerPart);
            if (ptr == headerSlice._ptr) {
                return (false, ret);
            }
            ptr = headerSlice._ptr;
            if (isBase64[i]) {
                bytes memory decoded = LibBase64.decode(headerPart.toBytes());
                retPart[i] = LibSlice.toSlice(decoded);
            } else {
                retPart[i] = headerPart;
            }
        }

        ret = LibSlice.concat_all(retPart);

        if (subjectPadding.length > 0) {
            ret = LibSlice.toSlice(subjectPadding).concat(
                LibSlice.toSlice(ret)
            );
        }
        return (true, ret);
    }
}
