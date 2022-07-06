// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

abstract contract IModuleAuth {
    enum SigType {
        SigMasterKey,
        SigRecoveryEmail,
        SigMasterKeyWithRecoveryEmail,
        SigSessionKey,
        SigNone
    }

    function _executeInner(bytes calldata _input) internal virtual;

    function _isValidSignature(
        SigType _sigType,
        bytes32 _hash,
        bytes calldata _signature,
        uint256 _index
    ) internal virtual returns (bool);
}
