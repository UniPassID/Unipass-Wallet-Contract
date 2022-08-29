// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "../DkimKeys.sol";
import "../utils/LibBytes.sol";

contract TestDkimVerify is DkimKeys {
    using LibBytes for bytes;

    constructor(address _admin) DkimKeys(_admin) {}

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
        {
            index = DkimParamsIndexNum * 4 + _index;
            uint32 len;
            (len, index) = _data.cReadUint32(index);
            emailHeader = _data[index:index + len];
            index += len;
        }
        emailHash = _getEmailFrom(_data, _index, emailHeader, _pepper);
        bytes calldata subjectHeader = _getSubjectHeader(_data, _index, emailHeader);
        sigHashHex = _parseSubjectHeader(subjectHeader);
        (ret, index) = _validateEmailDkim(_data, _index, emailHeader, index);
    }
}
