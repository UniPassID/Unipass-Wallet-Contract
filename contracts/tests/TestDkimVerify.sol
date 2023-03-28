// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.15;

import "../DkimKeys.sol";
import "../utils/LibBytes.sol";

contract TestDkimVerify is DkimKeys {
    using LibBytes for bytes;

    constructor(address _admin, IDkimZK _dkimZK) DkimKeys(_admin, _dkimZK) {}

    function dkimParse(
        bytes calldata _data,
        uint256 _index,
        bytes32 _pepper
    )
        external
        view
        returns (
            bool ret,
            bytes32 emailHash,
            bytes memory sigHashHex,
            uint256 index
        )
    {
        bytes calldata emailHeader;
        bytes calldata sig;
        {
            index = DkimParamsIndexNum * 4 + _index;
            uint32 len;
            (len, index) = _data.cReadUint32(index);
            emailHeader = _data[index:index + len];
            index += len;
            (len, index) = _data.cReadUint32(index);
            sig = _data[index:index + len];
            index += len;
        }
        emailHash = _getEmailFrom(_pepper, _index, _data, emailHeader);
        bytes calldata subjectHeader = _getSubjectHeader(_index, _data, emailHeader);
        sigHashHex = _parseSubjectHeader(subjectHeader);
        ret = _validateEmailDkim(_index, _data, emailHeader, sig);
    }

    function dkimParseByZK(bytes calldata _data, uint256 _index)
        external
        view
        returns (
            bool ret,
            bytes32 emailHash,
            bytes memory sigHashHex,
            uint256 index
        )
    {
        bytes calldata emailHeader;
        bytes calldata sig;
        {
            index = DkimParamsIndexNum * 4 + _index;
            uint32 len;
            (len, index) = _data.cReadUint32(index);
            emailHeader = _data[index:index + len];
            index += len;
            (len, index) = _data.cReadUint32(index);
            sig = _data[index:index + len];
            index += len;
        }
        bytes32 emailHeaderHash;
        (emailHash, emailHeaderHash, index) = _getEmailFromByZK(index, _index, _data, emailHeader);
        {
            bytes calldata subjectHeader = _getSubjectHeader(_index, _data, emailHeader);
            sigHashHex = _parseSubjectHeader(subjectHeader);
        }
        ret = _validateEmailDkimByZK(emailHeaderHash, _index, _data, emailHeader, sig);
    }
}
