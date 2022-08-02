// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "./ModuleStorage.sol";
import "../utils/LibDkim.sol";
import "../../interfaces/IDkimKeys.sol";
import "../../utils/LibRsa.sol";
import "../../utils/LibBytes.sol";

import "hardhat/console.sol";

abstract contract ModuleDkimAuth {
    using LibDkimValidator for DkimParams;
    using LibSlice for Slice;
    using LibBytes for bytes;

    IDkimKeys public immutable dkimKeys;

    constructor(IDkimKeys _dkimKeys) {
        require(address(_dkimKeys) != address(0), "constructor: ZERO");
        dkimKeys = _dkimKeys;
    }

    function dkimVerify(DkimParams memory params, bytes memory inputEmailFrom)
        public
        view
        returns (
            bool ret,
            bytes32 emailHash,
            bytes memory sigHashHex
        )
    {
        bytes memory sdid;
        bytes memory selector;
        bytes memory emailFrom;
        (emailFrom, sigHashHex, sdid, selector) = params._parseHeader();

        require(sigHashHex.length == 66, "dkimVerify: INVALID_SIGHASHHEX");

        Slice memory sdidSlice = LibSlice.toSlice(sdid);
        emailFrom = LibDkimValidator.checkEmailFrom(emailFrom, sdidSlice);
        bytes memory inputEmailFromRet = LibDkimValidator.checkEmailFrom(
            inputEmailFrom,
            sdidSlice
        );
        require(
            keccak256(emailFrom) == keccak256(inputEmailFromRet),
            "dkimVerify: INVALID_EMAIL_FROM"
        );
        emailHash = LibDkimValidator.emailAddressHash(inputEmailFrom);

        bytes32 hash = sha256(params.emailHeader);
        bytes memory n = dkimKeys.getDKIMKey(abi.encodePacked(selector, sdid));
        require(n.length > 0, "zero");
        ret = LibRsa.rsapkcs1Verify(hash, n, hex"010001", params.dkimSig);
    }
}
