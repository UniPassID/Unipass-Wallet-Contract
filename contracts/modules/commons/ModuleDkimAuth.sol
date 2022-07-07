// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "../utils/LibDkim.sol";
import "../../interfaces/IDkimKeys.sol";
import "../../utils/LibRsa.sol";

abstract contract ModuleDkimAuth {
    using LibDkimValidator for DkimParams;

    IDkimKeys public dkimKeys;

    function dkimVerify(DkimParams memory params)
        external
        view
        returns (
            bool ret,
            bytes32 emailHash,
            bytes memory sigHashHex
        )
    {
        bytes memory sdid;
        bytes memory selector;
        (emailHash, sigHashHex, sdid, selector) = params.parseHeader();
        require(
            sigHashHex.length == 66,
            "ModuleDkimAuth#dkimVerify: INVALID_SIGHASHHEX"
        );
        // 验证dkim签名
        bytes32 hash = sha256(params.emailHeader);
        bytes memory n = dkimKeys.getDKIMKey(abi.encodePacked(selector, sdid));
        require(n.length > 0, "zero");
        ret = LibRsa.rsapkcs1Verify(hash, n, hex"010001", params.dkimSig);
        return (ret, emailHash, sigHashHex);
    }
}
