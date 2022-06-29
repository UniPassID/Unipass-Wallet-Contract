// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "./ModuleFactoryAuth.sol";
import "../utils/LibDkim.sol";
import "../../interfaces/IDkimKeys.sol";
import "../../utils/LibRsa.sol";

contract ModuleDkimAuth is ModuleFactoryAuth {
    using LibDkimValidator for DkimParams;

    IDkimKeys public dkimKeys;

    constructor(address _factory) ModuleFactoryAuth(_factory) {}

    function init(IDkimKeys _dkimKeys) external onlyFactory {
        dkimKeys = _dkimKeys;
    }

    function parseHeader(DkimParams calldata params)
        external
        pure
        returns (
            bytes32 emailHash,
            bytes memory sigHashHex,
            bytes memory sdid,
            bytes memory selector
        )
    {
        (emailHash, sigHashHex, sdid, selector) = params.parseHeader();
    }

    function dkimVerify(DkimParams calldata params)
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
            "ModuleDkimAuth#dkimVeirfy: INVALID_SIGHASHHEX"
        );
        // 验证dkim签名
        bytes32 hash = sha256(params.emailHeader);
        bytes memory n = dkimKeys.getDKIMKey(abi.encodePacked(selector, sdid));
        require(n.length > 0, "zero");
        ret = LibRsa.rsapkcs1Verify(hash, n, hex"010001", params.dkimSig);
        return (ret, emailHash, sigHashHex);
    }
}
