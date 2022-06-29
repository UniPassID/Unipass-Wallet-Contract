// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./LibModexpPrecompile.sol";
import "./LibBytes.sol";

library LibRsa {
    using LibBytes for bytes;

    function rsapkcs1Verify(
        bytes32 hash,
        bytes memory n,
        bytes memory e,
        bytes memory sig
    ) internal view returns (bool) {
        // Recover the message from the signature
        bool ok;
        bytes memory result;
        (ok, result) = ModexpPrecompile.modexp(sig, e, n);

        // Verify it ends with the hash of our data
        return ok && hash == result.readBytes32(result.length - 32);
    }
}
