// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "./modules/commons/ModuleAdminAuth.sol";
import "./modules/utils/LibEmailHash.sol";
import "./interfaces/IDkimKeys.sol";
import "./interfaces/IDkimZK.sol";
import "./utils/LibRsa.sol";
import "./utils/LibBytes.sol";
import "./DkimZK.sol";

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/Address.sol";

contract DkimKeys is IDkimKeys, Initializable, ModuleAdminAuth, UUPSUpgradeable {
    using LibBytes for bytes;
    using Address for address;

    mapping(bytes => bytes) private dkimKeys;

    IDkimZK private immutable INIT_DKIM_ZK;
    //                       DKIM_ZK_KEY = keccak256("unipass-wallet:dkim-keys:dkim-zk")
    bytes32 private constant DKIM_ZK_KEY = bytes32(0x08e244ce7c80bf74866107e07498207da4f3ec114139ab51179c7be9b15869d7);

    event UpdateDKIMKey(bytes emailServer, bytes key);
    event DeleteDKIMKey(bytes emailServer, bytes oldKey);

    error InvalidEncodings(bytes1 _encodings);
    error InvalidEmailType(EmailType _emailType);
    error InvalidEmailVerifyType(uint8 _emailVerifyType);
    error GetEmailHashByZKRevert(bytes _reason);

    bytes1 public constant AtSignBytes1 = 0x40;
    bytes1 public constant DotSignBytes1 = 0x2e;

    enum DkimParamsIndex {
        emailType,
        subjectIndex,
        subjectRightIndex,
        fromIndex,
        fromLeftIndex,
        fromRightIndex,
        dkimHeaderIndex,
        selectorIndex,
        selectorRightIndex,
        sdidIndex,
        sdidRightIndex
    }
    uint256 constant DkimParamsIndexNum = 11;

    uint256 private constant VERIFY_BY_ORI_EMAIL = 0;
    uint256 private constant VERIFY_BY_ZK = 1;

    constructor(address _admin, IDkimZK _dkimZK) ModuleAdminAuth(_admin) {
        INIT_DKIM_ZK = _dkimZK;
        _disableInitializers();
    }

    function initialize() public initializer {
        __UUPSUpgradeable_init();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyAdmin {}

    function _writeDkimZK(IDkimZK _dkimZK) internal {
        ModuleStorage.writeBytes32(DKIM_ZK_KEY, bytes32(bytes20(address(_dkimZK))));
    }

    function _readDkimZK() public view returns (IDkimZK dkimZK) {
        dkimZK = IDkimZK(address(bytes20(ModuleStorage.readBytes32(DKIM_ZK_KEY))));
    }

    function getDkimZK() public view returns (IDkimZK dkimZK) {
        dkimZK = _readDkimZK();
        if (address(dkimZK) == address(0)) dkimZK = INIT_DKIM_ZK;
    }

    function updateDkimZK(IDkimZK _dkimZK) external onlyAdmin {
        require(address(_dkimZK).isContract(), "updateDkimZK: INVALID_DKIM_ZK");
        _writeDkimZK(_dkimZK);
    }

    function getDKIMKey(bytes memory _emailServer) public view override returns (bytes memory) {
        return dkimKeys[_emailServer];
    }

    function updateDKIMKey(bytes calldata _emailServer, bytes calldata key) external onlyAdmin {
        dkimKeys[_emailServer] = key;
        emit UpdateDKIMKey(_emailServer, key);
    }

    function batchUpdateDKIMKeys(bytes[] calldata _emailServers, bytes[] calldata _keys) external onlyAdmin {
        uint256 length = _emailServers.length;
        require(length == _keys.length, "batchUpdateDKIMKeys: INVALID_LENGTH");
        for (uint256 i; i < length; i++) {
            bytes calldata emailServer = _emailServers[i];
            bytes calldata key = _keys[i];
            dkimKeys[emailServer] = key;
            emit UpdateDKIMKey(emailServer, key);
        }
    }

    function deleteDKIMKey(bytes calldata _emailServer) external onlyAdmin {
        bytes memory oldKey = dkimKeys[_emailServer];
        delete dkimKeys[_emailServer];
        emit DeleteDKIMKey(_emailServer, oldKey);
    }

    function _validateEmailSubject(
        uint256 _dkimParamsStartIndex,
        bytes calldata _data,
        bytes calldata _emailHeader
    ) internal pure returns (bytes memory sigHashHex, EmailType emailType) {
        bytes calldata subjectHeader = _getSubjectHeader(_dkimParamsStartIndex, _data, _emailHeader);
        bytes memory decodedSubject = _parseSubjectHeader(subjectHeader);
        uint32 emailTypeInt;
        (emailTypeInt, ) = _data.cReadUint32(_dkimParamsStartIndex + uint256(DkimParamsIndex.emailType) * 4);
        emailType = (EmailType)(emailTypeInt);
        sigHashHex = _checkSubjectHeader(decodedSubject, emailType);
    }

    function _getSubjectHeader(
        uint256 _dkimParamsStartIndex,
        bytes calldata _data,
        bytes calldata _emailHeader
    ) internal pure returns (bytes calldata subjectHeader) {
        uint32 subjectIndex;
        (subjectIndex, ) = _data.cReadUint32(_dkimParamsStartIndex + uint256(DkimParamsIndex.subjectIndex) * 4);
        uint32 subjectRightIndex;
        (subjectRightIndex, ) = _data.cReadUint32(_dkimParamsStartIndex + uint256(DkimParamsIndex.subjectRightIndex) * 4);
        // see https://datatracker.ietf.org/doc/html/rfc5322#section-2.2
        if (subjectIndex != 0) {
            require(_emailHeader.mcReadBytesN(subjectIndex - 2, 10) == bytes32("\r\nsubject:"), "FE");
        } else {
            require(_emailHeader.mcReadBytesN(subjectIndex, 8) == bytes32("subject:"), "FE");
        }
        // see https://datatracker.ietf.org/doc/html/rfc5322#section-2.2
        for (uint256 i = subjectIndex + 8; i < subjectRightIndex; i++) {
            require(_emailHeader[i] != "\n", "NE");
        }

        subjectHeader = _emailHeader[subjectIndex + 8:subjectRightIndex];
    }

    function _getEmailFromIndexes(
        uint256 _dkimParamsStartIndex,
        bytes calldata _data,
        bytes calldata _emailHeader
    ) internal pure returns (uint32 fromIndex, uint32 fromLeftIndex, uint32 fromRightIndex) {
        (fromIndex, ) = _data.cReadUint32(_dkimParamsStartIndex + uint256(DkimParamsIndex.fromIndex) * 4);
        (fromLeftIndex, ) = _data.cReadUint32(_dkimParamsStartIndex + uint256(DkimParamsIndex.fromLeftIndex) * 4);
        (fromRightIndex, ) = _data.cReadUint32(_dkimParamsStartIndex + uint256(DkimParamsIndex.fromRightIndex) * 4);
        if (fromIndex != 0) {
            require(_emailHeader.mcReadBytesN(fromIndex - 2, 7) == bytes32("\r\nfrom:"), "FE");
        } else {
            require(_emailHeader.mcReadBytesN(fromIndex, 5) == bytes32("from:"), "FE");
        }
        // see https://www.rfc-editor.org/rfc/rfc2822#section-3.4.1
        require(fromIndex + 4 < fromLeftIndex && fromLeftIndex < fromRightIndex, "LE");
        if (_emailHeader[fromLeftIndex - 1] == "<" && _emailHeader[fromRightIndex + 1] == ">") {
            for (uint256 i = fromLeftIndex - 1; i > fromIndex + 4; i--) {
                require(_emailHeader[i] != "\n", "NE");
            }
        } else {
            require(fromLeftIndex == fromIndex + 5, "AE");
        }
    }

    function _getEmailFrom(
        bytes32 _pepper,
        uint256 _dkimParamsStartIndex,
        bytes calldata _data,
        bytes calldata _emailHeader
    ) internal pure returns (bytes32 emailHash) {
        (, uint32 fromLeftIndex, uint32 fromRightIndex) = _getEmailFromIndexes(_dkimParamsStartIndex, _data, _emailHeader);

        emailHash = LibEmailHash.emailAddressHash(_emailHeader[fromLeftIndex:fromRightIndex + 1], _pepper);
    }

    function _getEmailFromByZK(
        uint256 _dkimParamsEndIndex,
        uint256 _dkimParamsStartindex,
        bytes calldata _data,
        bytes calldata _emailHeader
    ) internal view returns (bytes32 emailHash, bytes32 emailHeaderHash, uint256 dkimParamsEndIndex) {
        (, uint32 fromLeftIndex, uint32 fromRightIndex) = _getEmailFromIndexes(_dkimParamsStartindex, _data, _emailHeader);

        (emailHash, emailHeaderHash, dkimParamsEndIndex) = _getEmailHashByZK(
            fromLeftIndex,
            fromRightIndex - fromLeftIndex + 1,
            _dkimParamsEndIndex,
            _emailHeader,
            _data
        );
    }

    function _getEmailHashByZK(
        uint32 _fromLeftIndex,
        uint32 _fromLen,
        uint256 _dkimParamsEndIndex,
        bytes calldata _headerPubMatch,
        bytes calldata _data
    ) internal view returns (bytes32, bytes32, uint256) {
        IDkimZK dkimZK = getDkimZK();
        try dkimZK.getEmailHashByZK(_fromLeftIndex, _fromLen, _dkimParamsEndIndex, _headerPubMatch, _data) returns (
            bytes32 emailHash,
            bytes32 emailHeaderHash,
            uint256 index
        ) {
            return (emailHash, emailHeaderHash, index);
        } catch (bytes memory reason) {
            revert GetEmailHashByZKRevert(reason);
        }
    }

    function _getDkimInfo(
        bytes calldata _data,
        uint256 _dkimParamsStartIndex,
        bytes calldata _emailHeader
    ) internal pure returns (bytes32 selector, bytes32 sdid) {
        uint32 dkimHeaderIndex;
        (dkimHeaderIndex, ) = _data.cReadUint32(_dkimParamsStartIndex + uint256(DkimParamsIndex.dkimHeaderIndex) * 4);
        require(_emailHeader.mcReadBytesN(dkimHeaderIndex - 2, 17) == bytes32("\r\ndkim-signature:"), "DE");

        {
            uint256 selectorIndex;
            (selectorIndex, ) = _data.cReadUint32(_dkimParamsStartIndex + uint256(DkimParamsIndex.selectorIndex) * 4);
            uint256 selectorRightIndex;
            (selectorRightIndex, ) = _data.cReadUint32(_dkimParamsStartIndex + uint256(DkimParamsIndex.selectorRightIndex) * 4);
            require(selectorIndex > dkimHeaderIndex, "DHE");
            require(_emailHeader.mcReadBytesN(selectorIndex - 4, 4) == bytes32("; s="), "DSE");
            selector = bytes32(_emailHeader[selectorIndex:selectorRightIndex]);
        }

        {
            uint256 sdidIndex;
            (sdidIndex, ) = _data.cReadUint32(_dkimParamsStartIndex + uint256(DkimParamsIndex.sdidIndex) * 4);
            uint256 sdidRightIndex;
            (sdidRightIndex, ) = _data.cReadUint32(_dkimParamsStartIndex + uint256(DkimParamsIndex.sdidRightIndex) * 4);
            require(sdidIndex > dkimHeaderIndex, "DHE");

            require(_emailHeader.mcReadBytesN(sdidIndex - 4, 4) == bytes32("; d="), "DDE");
            sdid = _emailHeader.mcReadBytesN(sdidIndex, sdidRightIndex - sdidIndex);
        }
    }

    function _validateEmailDkim(
        uint256 _dkimParamsStartIndex,
        bytes calldata _data,
        bytes calldata _emailHeader,
        bytes calldata _dkimSig
    ) internal view returns (bool ret) {
        bytes32 selector;
        bytes32 sdid;
        (selector, sdid) = _getDkimInfo(_data, _dkimParamsStartIndex, _emailHeader);

        bytes memory n = getDKIMKey(abi.encodePacked(selector, sdid));
        require(n.length > 0, "zero");
        ret = LibRsa.rsapkcs1Verify(sha256(_emailHeader), n, hex"010001", _dkimSig);
    }

    function _validateEmailDkimByZK(
        bytes32 _emailHeaderHash,
        uint256 _dkimParamsStartIndex,
        bytes calldata _data,
        bytes calldata _emailHeaderMatch,
        bytes calldata _dkimSig
    ) internal view returns (bool ret) {
        bytes32 selector;
        bytes32 sdid;
        (selector, sdid) = _getDkimInfo(_data, _dkimParamsStartIndex, _emailHeaderMatch);

        bytes memory n = getDKIMKey(abi.encodePacked(selector, sdid));
        require(n.length > 0, "zero");
        ret = LibRsa.rsapkcs1Verify(_emailHeaderHash, n, hex"010001", _dkimSig);
    }

    function dkimVerify(
        uint256 _dkimParamsStartIndex,
        bytes calldata _data
    )
        external
        view
        override
        returns (bool ret, EmailType emailType, bytes32 emailHash, bytes32 subjectHash, uint256 dkimParamsEndIndex)
    {
        uint8 emailVerifyType = _data.mcReadUint8(_dkimParamsStartIndex);
        ++_dkimParamsStartIndex;

        bytes calldata emailHeader;
        bytes calldata dkimSig;
        {
            dkimParamsEndIndex = DkimParamsIndexNum * 4 + _dkimParamsStartIndex;
            uint32 len;
            (len, dkimParamsEndIndex) = _data.cReadUint32(dkimParamsEndIndex);
            emailHeader = _data[dkimParamsEndIndex:dkimParamsEndIndex + len];
            dkimParamsEndIndex += len;
            (len, dkimParamsEndIndex) = _data.cReadUint32(dkimParamsEndIndex);
            dkimSig = _data[dkimParamsEndIndex:dkimParamsEndIndex + len];
            dkimParamsEndIndex += len;
        }

        {
            bytes memory subject;
            (subject, emailType) = _validateEmailSubject(_dkimParamsStartIndex, _data, emailHeader);
            subjectHash = keccak256(subject);
        }
        if (emailVerifyType == VERIFY_BY_ORI_EMAIL) {
            bytes32 pepper = _data.mcReadBytes32(dkimParamsEndIndex);
            dkimParamsEndIndex += 32;
            emailHash = _getEmailFrom(pepper, _dkimParamsStartIndex, _data, emailHeader);
            ret = _validateEmailDkim(_dkimParamsStartIndex, _data, emailHeader, dkimSig);
        } else if (emailVerifyType == VERIFY_BY_ZK) {
            bytes32 emailHeaderHash;
            (emailHash, emailHeaderHash, dkimParamsEndIndex) = _getEmailFromByZK(
                dkimParamsEndIndex,
                _dkimParamsStartIndex,
                _data,
                emailHeader
            );
            ret = _validateEmailDkimByZK(emailHeaderHash, _dkimParamsStartIndex, _data, emailHeader, dkimSig);
        } else {
            revert InvalidEmailVerifyType(emailVerifyType);
        }
    }

    function removeDotForEmailFrom(bytes calldata _emailFrom, uint256 _atSignIndex) internal pure returns (bytes memory fromRet) {
        uint256 leftIndex;
        for (uint256 index; index < _atSignIndex; index++) {
            fromRet = leftIndex == 0 ? _emailFrom[leftIndex:index] : bytes.concat(fromRet, _emailFrom[leftIndex:index]);
            leftIndex = index;
        }
        if (leftIndex == 0) {
            fromRet = _emailFrom;
        } else {
            bytes.concat(fromRet, _emailFrom[_atSignIndex:_emailFrom.length]);
        }
    }

    function _parseSubjectHeader(bytes calldata _subjectHeader) internal pure returns (bytes memory ret) {
        uint256 index;
        while (index < _subjectHeader.length - 1) {
            if (_subjectHeader[index] == " ") {
                ++index;
                continue;
            }

            uint256 startIndex;
            uint256 endIndex;

            if (_subjectHeader[index + 1] == "?") {
                require(_subjectHeader[index] == "=", "_parseSubjectHeader: INVALID_HEADER");
                bytes1 encodings;
                index += 2;
                while (index < _subjectHeader.length - 1) {
                    if (_subjectHeader[index] == "?" && _subjectHeader[index + 2] == "?") {
                        encodings = _subjectHeader[index + 1];
                        index += 3;
                        startIndex = index;
                        break;
                    }
                    ++index;
                }
                require(startIndex != 0, "_parseSubjectHeader: INVALID_START_HEADER");
                while (index < _subjectHeader.length - 1) {
                    if (_subjectHeader[index + 1] == "?") {
                        require(_subjectHeader[index + 2] == "=", "_parseSubjectHeader: INVALID_HEADER");
                        endIndex = index + 1;
                        index += 2;
                        break;
                    }
                    ++index;
                }
                require(endIndex != 0, "_parseSubjectHeader: INVALID_END_HEADER");
                if (encodings == "B" || encodings == "b") {
                    ret = bytes.concat(ret, LibBase64.decode(_subjectHeader[startIndex:endIndex]));
                    continue;
                }
                if (encodings == "Q" || encodings == "q") {
                    ret = bytes.concat(ret, _subjectHeader[startIndex:endIndex]);
                    continue;
                }
                revert InvalidEncodings(encodings);
            }

            startIndex = index;
            while (index < _subjectHeader.length - 1) {
                if (_subjectHeader[index + 1] == " ") {
                    endIndex = index;
                    index += 2;
                }
                ++index;
            }
            endIndex = endIndex == 0 ? _subjectHeader.length : endIndex;
            ret = bytes.concat(ret, _subjectHeader[startIndex:endIndex]);
        }
    }

    function _checkSubjectHeader(
        bytes memory _decodedSubjectHeader,
        EmailType _emailType
    ) private pure returns (bytes memory sigHashHex) {
        if (_emailType == EmailType.UpdateKeysetHash) {
            require(_decodedSubjectHeader.length == 89, "_checkSubjectHeader: INVALID_LENGTH");
            require(
                _decodedSubjectHeader.readBytesN(0, 25) == "UniPass-Update-Account-0x",
                "_checkSubjectHeader: INVALID_HEADER"
            );
            (sigHashHex, ) = _decodedSubjectHeader.readBytes66(23);
        } else if (_emailType == EmailType.LockKeysetHash) {
            require(_decodedSubjectHeader.length == 89, "_checkSubjectHeader: INVALID_LENGTH");
            require(
                _decodedSubjectHeader.readBytesN(0, 25) == "UniPass-Start-Recovery-0x",
                "_checkSubjectHeader: INVALID_HEADER"
            );
            (sigHashHex, ) = _decodedSubjectHeader.readBytes66(23);
        } else if (_emailType == EmailType.CancelLockKeysetHash) {
            require(_decodedSubjectHeader.length == 90, "_checkSubjectHeader: INVALID_LENGTH");
            require(
                _decodedSubjectHeader.readBytesN(0, 26) == "UniPass-Cancel-Recovery-0x",
                "_checkSubjectHeader: INVALID_HEADER"
            );
            (sigHashHex, ) = _decodedSubjectHeader.readBytes66(24);
        } else if (_emailType == EmailType.UpdateTimeLockDuring) {
            require(_decodedSubjectHeader.length == 90, "_checkSubjectHeader: INVALID_LENGTH");
            require(
                _decodedSubjectHeader.readBytesN(0, 26) == "UniPass-Update-Timelock-0x",
                "_checkSubjectHeader: INVALID_HEADER"
            );
            (sigHashHex, ) = _decodedSubjectHeader.readBytes66(24);
        } else if (_emailType == EmailType.UpdateImplementation) {
            require(_decodedSubjectHeader.length == 96, "_checkSubjectHeader: INVALID_LENGTH");
            require(
                _decodedSubjectHeader.readBytes32(0) == "UniPass-Update-Implementation-0x",
                "_checkSubjectHeader: INVALID_HEADER"
            );
            (sigHashHex, ) = _decodedSubjectHeader.readBytes66(30);
        } else if (_emailType == EmailType.SyncAccount) {
            require(_decodedSubjectHeader.length == 87, "_checkSubjectHeader: INVALID_LENGTH");
            require(_decodedSubjectHeader.readBytesN(0, 23) == "UniPass-Sync-Account-0x", "_checkSubjectHeader: INVALID_HEADER");
            (sigHashHex, ) = _decodedSubjectHeader.readBytes66(21);
        } else if (_emailType == EmailType.CallOtherContract) {
            require(_decodedSubjectHeader.length == 88, "_checkSubjectHeader: INVALID_LENGTH");
            require(_decodedSubjectHeader.readBytesN(0, 24) == "UniPass-Call-Contract-0x", "_checkSubjectHeader: INVALID_HEADER");
            (sigHashHex, ) = _decodedSubjectHeader.readBytes66(22);
        } else {
            revert InvalidEmailType(_emailType);
        }
    }
}
