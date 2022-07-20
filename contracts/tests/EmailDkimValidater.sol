// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "../modules/utils/LibDkim.sol";

contract EmailDkimValidator {
    using LibDkimValidator for DkimParams;

    function parseHeader(DkimParams calldata params)
        external
        pure
        returns (
            bytes memory emailFrom,
            bytes memory sigHashHex,
            bytes memory sdid,
            bytes memory selector
        )
    {
        (emailFrom, sigHashHex, sdid, selector) = params._parseHeader();
    }
}
