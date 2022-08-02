// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

enum SigType {
    SigMasterKey,
    SigRecoveryEmail,
    SigMasterKeyWithRecoveryEmail,
    SigSessionKey,
    SigNone
}

library LibSigType {
    error InvalidSigType(SigType _sigType);

    function _toSignatureWeight(SigType self)
        internal
        pure
        returns (uint256 signatureWeight)
    {
        if (self == SigType.SigNone) {
            signatureWeight = 0;
        } else if (self == SigType.SigSessionKey) {
            signatureWeight = 1;
        } else if (
            self == SigType.SigMasterKey || self == SigType.SigRecoveryEmail
        ) {
            signatureWeight = 2;
        } else if (self == SigType.SigMasterKeyWithRecoveryEmail) {
            signatureWeight = 3;
        } else {
            revert InvalidSigType(self);
        }
    }
}
